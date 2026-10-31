import com.android.build.api.artifact.SingleArtifact
import java.net.URI
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun checkedOrigin(value: String, production: Boolean): String {
    require(value.isNotBlank()) { "Production packaging is blocked: approve an HTTPS origin in apps/android/production-api-origin.txt first." }
    val uri = URI(value)
    require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && uri.path.isNullOrEmpty()) { "API URL must be an origin without a path, credentials, query or fragment." }
    require(uri.port == -1 || uri.port in 1..65535)
    if (production) {
        require(value == "https://chordviewer.app") { "Release builds must use https://chordviewer.app." }
        require(uri.scheme == "https" && uri.host.contains('.') && !uri.host.matches(Regex("[0-9.]+")) &&
            !uri.host.endsWith(".local") && !uri.host.endsWith(".localhost") && !uri.host.endsWith(".test") &&
            !uri.host.endsWith(".invalid") && !uri.host.endsWith(".example") && uri.host != "example.com") { "Approve a real production HTTPS hostname, never a development IP or placeholder." }
    } else {
        val parts = uri.host.split('.').map { it.toIntOrNull() }
        val privateIp = parts.size == 4 && parts.all { it != null && it in 0..255 } &&
            (parts[0] == 10 || parts[0] == 172 && parts[1]!! in 16..31 || parts[0] == 192 && parts[1] == 168 || uri.host == "127.0.0.1")
        require(uri.scheme == "http" && privateIp && uri.host == parts.joinToString(".")) { "Development API URL must use HTTP and a canonical private IPv4 address or 127.0.0.1." }
    }
    require(uri.host == uri.host.lowercase() && !(uri.scheme == "https" && uri.port == 443) && !(uri.scheme == "http" && uri.port == 80)) { "Use a canonical origin (lowercase hostname; omit the default port)." }
    return value
}

abstract class GenerateApiEndpoint : DefaultTask() {
    @get:Input abstract val origin: Property<String>
    @get:Input abstract val development: Property<Boolean>
    @get:OutputDirectory abstract val assetsDirectory: DirectoryProperty
    @get:OutputDirectory abstract val resDirectory: DirectoryProperty
    @TaskAction fun generate() {
        assetsDirectory.file("api-origin.txt").get().asFile.apply { parentFile.mkdirs(); writeText(origin.get() + "\n") }
        val res = resDirectory.get().asFile.apply { mkdirs() }
        if (development.get()) {
            val host = URI(origin.get()).host
            val domains = setOf("127.0.0.1", host).joinToString("\n") { "        <domain includeSubdomains=\"false\">$it</domain>" }
            res.resolve("xml/debug_network_security.xml").apply {
                parentFile.mkdirs()
                writeText("<network-security-config>\n    <base-config cleartextTrafficPermitted=\"false\" />\n" +
                    "    <domain-config cleartextTrafficPermitted=\"true\">\n$domains\n    </domain-config>\n</network-security-config>\n")
            }
        }
    }
}

abstract class VerifyReleaseIsolation : DefaultTask() {
    @get:Input abstract val approvedOrigin: Property<String>
    @get:InputFile abstract val manifest: RegularFileProperty
    @get:InputDirectory abstract val assets: DirectoryProperty
    @TaskAction fun verify() {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        }
        val document = factory.newDocumentBuilder().parse(manifest.get().asFile)
        val app = document.getElementsByTagName("application").item(0) as org.w3c.dom.Element
        val namespace = "http://schemas.android.com/apk/res/android"
        check(app.getAttributeNS(namespace, "debuggable") in setOf("", "false")) { "Release must not be debuggable." }
        check(app.getAttributeNS(namespace, "usesCleartextTraffic") == "false") { "Release must prohibit HTTP." }
        check(!app.hasAttributeNS(namespace, "networkSecurityConfig")) { "Release must use platform TLS trust with no network policy overrides." }
        check(assets.file("api-origin.txt").get().asFile.readText().trim() == approvedOrigin.get()) { "Development endpoint leaked into release assets." }
        logger.lifecycle("Release isolation verified; production endpoint {}.", if (approvedOrigin.get().isEmpty()) "is unconfigured (packaging blocked)" else "matches reviewed configuration")
    }
}

abstract class VerifyReleaseArchive : DefaultTask() {
    @get:Input abstract val approvedOrigin: Property<String>
    @get:InputFiles abstract val archives: ConfigurableFileCollection
    @get:InputFile abstract val aapt2: RegularFileProperty
    @TaskAction fun verify() {
        val files = archives.files.flatMap { if (it.isDirectory) it.walkTopDown().filter { file -> file.extension == "apk" }.toList() else listOf(it) }
        check(files.isNotEmpty()) { "No release archive was produced." }
        files.forEach { file ->
            ZipFile(file).use { zip ->
                val path = if (file.extension == "aab") "base/assets/api-origin.txt" else "assets/api-origin.txt"
                val entry = checkNotNull(zip.getEntry(path)) { "Packaged API origin is missing." }
                check(zip.getInputStream(entry).bufferedReader().use { it.readText().trim() } == approvedOrigin.get()) { "Packaged API origin is not approved." }
                check(zip.entries().asSequence().none { it.name.contains("debug_network_security") }) { "Debug HTTP policy leaked into release." }
            }
            if (file.extension == "apk") {
                val process = ProcessBuilder(aapt2.get().asFile.absolutePath, "dump", "xmltree", file.absolutePath, "--file", "AndroidManifest.xml")
                    .redirectErrorStream(true).start()
                val manifest = process.inputStream.bufferedReader().use { it.readText() }
                check(process.waitFor() == 0) { "Could not inspect packaged release manifest." }
                for (attribute in listOf("debuggable", "usesCleartextTraffic")) {
                    val declaration = manifest.lineSequence().firstOrNull { it.contains("android:$attribute(") }
                    val explicitlyFalse = declaration?.trim()?.let { it.endsWith("(type 0x12)0x0") || it.endsWith("=false") } == true
                    check((attribute == "debuggable" && declaration == null) || explicitlyFalse) { "Packaged release $attribute must be false." }
                }
                check(!manifest.contains("android:networkSecurityConfig(")) { "Packaged release contains a network policy override." }
            }
            logger.lifecycle("Verified packaged production endpoint: {}", file.name)
        }
    }
}

// This reviewed file is the only release endpoint authority. Never read a developer property here.
val approvedApiOrigin = providers.fileContents(rootProject.layout.projectDirectory.file("production-api-origin.txt")).asText.map { it.trim() }
val developmentApiOrigin = providers.gradleProperty("devApiUrl").orElse("http://127.0.0.1:3000")
val verifyProductionOrigin = tasks.register("verifyProductionOrigin") {
    inputs.property("approvedOrigin", approvedApiOrigin)
    doLast { checkedOrigin(approvedApiOrigin.get(), production = true) }
}
val releaseKeystore = providers.environmentVariable("CHORDVIEWER_KEYSTORE")
val releaseStorePassword = providers.environmentVariable("CHORDVIEWER_STORE_PASSWORD")
val releaseKeyPassword = providers.environmentVariable("CHORDVIEWER_KEY_PASSWORD")
val verifyReleaseSigning = tasks.register("verifyReleaseSigning") {
    doLast {
        check(releaseKeystore.isPresent && releaseStorePassword.isPresent && releaseKeyPassword.isPresent) {
            "Release packaging requires CHORDVIEWER_KEYSTORE, CHORDVIEWER_STORE_PASSWORD and CHORDVIEWER_KEY_PASSWORD. Keep signing material outside Git."
        }
    }
}

android {
    namespace = "com.chordviewer"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.chordviewer"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (releaseKeystore.isPresent) storeFile = file(releaseKeystore.get())
            storePassword = releaseStorePassword.orNull
            keyAlias = "chordviewer"
            keyPassword = releaseKeyPassword.orNull
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            signingConfig = signingConfigs.getByName("release")
            buildConfigField("String", "APPROVED_API_ORIGIN", "\"${approvedApiOrigin.get().replace("\\", "\\\\").replace("\"", "\\\"")}\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    buildFeatures { compose = true; buildConfig = true }
    sourceSets {
        getByName("main").assets.srcDir(rootProject.file("../../contracts/fixtures"))
        getByName("test").resources.srcDir(rootProject.file("../../contracts/fixtures"))
        getByName("test").resources.srcDir(rootProject.file("../../tests/fixtures/music"))
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

androidComponents {
    onVariants(selector().all()) { variant ->
        val debug = variant.buildType == "debug"
        val capitalized = variant.name.replaceFirstChar { it.uppercase() }
        val generate = tasks.register<GenerateApiEndpoint>("generate${capitalized}ApiEndpoint") {
            origin.set(if (debug) developmentApiOrigin.map { checkedOrigin(it, production = false) } else approvedApiOrigin)
            development.set(debug)
            assetsDirectory.set(layout.buildDirectory.dir("generated/apiEndpoint/${variant.name}/assets"))
            resDirectory.set(layout.buildDirectory.dir("generated/apiEndpoint/${variant.name}/res"))
            if (!debug) mustRunAfter(verifyProductionOrigin)
        }
        variant.sources.assets?.addGeneratedSourceDirectory(generate, GenerateApiEndpoint::assetsDirectory)
        variant.sources.res?.addGeneratedSourceDirectory(generate, GenerateApiEndpoint::resDirectory)
        if (!debug) {
            val isolation = tasks.register<VerifyReleaseIsolation>("verifyReleaseIsolation") {
                approvedOrigin.set(approvedApiOrigin)
                manifest.set(variant.artifacts.get(SingleArtifact.MERGED_MANIFEST))
                assets.set(variant.artifacts.get(SingleArtifact.ASSETS))
            }
            val apkCheck = tasks.register<VerifyReleaseArchive>("verifyReleaseApk") {
                dependsOn(isolation, verifyProductionOrigin)
                approvedOrigin.set(approvedApiOrigin)
                archives.from(variant.artifacts.get(SingleArtifact.APK))
                aapt2.set(androidComponents.sdkComponents.sdkDirectory.map { it.file("build-tools/35.0.0/" + if (System.getProperty("os.name").startsWith("Windows")) "aapt2.exe" else "aapt2") })
            }
            val bundleCheck = tasks.register<VerifyReleaseArchive>("verifyReleaseBundle") {
                dependsOn(isolation, verifyProductionOrigin)
                approvedOrigin.set(approvedApiOrigin)
                archives.from(variant.artifacts.get(SingleArtifact.BUNDLE))
                aapt2.set(androidComponents.sdkComponents.sdkDirectory.map { it.file("build-tools/35.0.0/" + if (System.getProperty("os.name").startsWith("Windows")) "aapt2.exe" else "aapt2") })
            }
            tasks.configureEach {
                if (name in setOf("packageRelease", "packageReleaseBundle", "signReleaseBundle")) dependsOn(verifyProductionOrigin, isolation, verifyReleaseSigning)
                if (name == "assembleRelease") dependsOn(apkCheck)
                if (name == "bundleRelease") dependsOn(bundleCheck)
            }
        }
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    testImplementation("junit:junit:4.13.2")
    // Use the real JSON implementation in score and library tests, not Android's stub.
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
