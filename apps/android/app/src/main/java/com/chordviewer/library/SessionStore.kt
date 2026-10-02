package com.chordviewer.library

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

interface SessionStore {
    fun load(): AccountSession?
    fun save(session: AccountSession)
    fun clear()
}

/** Only encrypted session data is stored; passwords never enter this store. Call off the main thread. */
class KeystoreSessionStore(context: Context, private val origin: String) : SessionStore {
    private val file = AtomicFile(File(context.noBackupFilesDir, "account-session.bin"))
    private companion object {
        val lock = Any()
        const val KEY_ALIAS = "chordviewer.account-session.v1"
        const val MAX_BYTES = 16_384
    }
    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun key(create: Boolean): SecretKey {
        (keyStore().getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        check(create) { "Saved session key is unavailable" }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
        }.generateKey()
    }
    override fun load(): AccountSession? = synchronized(lock) {
        val bytes = try {
            file.openRead().use { input ->
                val result = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(result.size() + count <= MAX_BYTES)
                    result.write(buffer, 0, count)
                }
                result.toByteArray()
            }
        } catch (_: FileNotFoundException) { return@synchronized null }
        require(bytes.size > 29 && bytes[0] == 1.toByte())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        // A credential saved for a different API origin must never be reused.
        cipher.updateAAD(origin.toByteArray(Charsets.UTF_8))
        val value = JSONObject(cipher.doFinal(bytes.copyOfRange(13, bytes.size)).toString(Charsets.UTF_8))
        val token = value.getString("token").also { require(LibraryApi.validToken(it)) }
        AccountSession(LibraryJson.account(value.getJSONObject("user")), token)
    }
    override fun save(session: AccountSession) = synchronized(lock) {
        require(LibraryApi.validToken(session.token))
        val user = session.user
        val value = JSONObject().put("token", session.token).put("user",
            JSONObject().put("id", user.id).put("name", user.name).put("email", user.email))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(true))
        cipher.updateAAD(origin.toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))
        require(cipher.iv.size == 12 && encrypted.size + 13 <= MAX_BYTES)
        val output = file.startWrite()
        try {
            output.write(byteArrayOf(1) + cipher.iv + encrypted)
            file.finishWrite(output)
        } catch (error: Exception) { file.failWrite(output); throw error }
    }
    override fun clear() = synchronized(lock) {
        // Removing the key also prevents recovery of a leftover encrypted file if deletion fails.
        try { keyStore().deleteEntry(KEY_ALIAS) } finally { file.delete() }
        check(!file.baseFile.exists()) { "Saved session could not be removed" }
    }
}
