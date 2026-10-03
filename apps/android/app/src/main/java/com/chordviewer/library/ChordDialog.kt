package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import android.view.MotionEvent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.motionEventSpy
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.chordviewer.score.*
import com.chordviewer.ui.*
import kotlin.math.roundToInt

/** One complete builder; only uncommon structured choices expand within this popup. */
@Composable
fun ChordDialog(state: LibraryState, model: LibraryViewModel) {
    val editor = state.editor ?: return
    val selected = editor.selectedId?.let { ChordTimeline.find(editor.score, it) }
    val initial = selected?.event?.let { it.definition ?: requireNotNull(ChordDefinition.parse(it.symbol)) { "The selected chord must have legal harmony." } }
        ?: editor.pending?.notes?.takeIf { it.isNotEmpty() }?.let { notes -> ChordDefinition(kind = "custom", root = ChordSpelling(), family = null, tones = notes.map { it % 12 }.distinct().sorted()) }
        ?: editor.chordEntryDefinition
    // A successful Add starts a new popup session even when two chords are equal.
    // Keep Apply/failure within the current session so corrective input survives.
    key(editor.chordDialogSession, editor.selectedId, editor.pending?.notes) {
    var draft by remember { mutableStateOf(initial) }
    val preview = draft.symbol
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val view = LocalView.current
    val windowWidth = with(density) { view.rootView.width.toDp().value }.takeIf { it > 0 } ?: configuration.screenWidthDp.toFloat()
    val windowHeight = with(density) { view.rootView.height.toDp().value }.takeIf { it > 0 } ?: configuration.screenHeightDp.toFloat()
    val topInset = WindowInsets.statusBars.getTop(density)
    val bottomInset = WindowInsets.navigationBars.getBottom(density)
    val margin = with(density) { 12.dp.roundToPx() }
    var besideWidth by remember(windowWidth,density) { mutableFloatStateOf(600f) }
    val positioner = remember(windowWidth, topInset, bottomInset, margin, density) { object : PopupPositionProvider {
        override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
            val space = maxOf(anchorBounds.left - margin * 2, windowSize.width - anchorBounds.right - margin * 2)
            val available = with(density) { space.toDp().value }
            val width = if(available >= 240f) available else windowWidth - 24
            if(besideWidth != width) besideWidth = width
            val right = anchorBounds.right + margin
            val left = anchorBounds.left - popupContentSize.width - margin
            val x = (if (right + popupContentSize.width <= windowSize.width - margin) right else if (left >= margin) left else anchorBounds.left)
                .coerceIn(margin, maxOf(margin, windowSize.width - popupContentSize.width - margin))
            val low = maxOf(margin, topInset)
            val high = maxOf(low, windowSize.height - bottomInset - popupContentSize.height - margin)
            return IntOffset(x, (anchorBounds.bottom + margin).coerceIn(low, high))
        }
    } }
    Popup(popupPositionProvider = positioner, onDismissRequest = model::closeChordDialog,
        properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true)) {
        // A popup creates its own Android composition locals. Keep sizing and text
        // consistent with the density used for the anchor and viewport calculation.
        CompositionLocalProvider(LocalDensity provides density) {
        val focus = remember { FocusRequester() }
        LaunchedEffect(Unit) { focus.requestFocus() }
        Surface(Modifier.width(minOf(600f,besideWidth,(windowWidth - 24).coerceAtLeast(240f)).coerceAtLeast(240f).dp)
            .heightIn(max = (windowHeight - with(density) { (topInset + bottomInset).toDp().value } - 24).coerceAtLeast(240f).dp)
            .onPreviewKeyEvent { if(it.key == Key.Escape) { model.closeChordDialog(); true } else false }
            .focusRequester(focus).focusable()
            .semantics { paneTitle = if (selected == null) "Add chord" else "Edit chord" },
            shape = MaterialTheme.shapes.large, color = PaperColor, shadowElevation = 16.dp, border = BorderStroke(1.dp, BorderColor)) {
            val scroll = rememberScrollState()
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (selected == null) "Add chord" else "Edit chord", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    TextButton(model::closeChordDialog, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Close chord dialog" }) { Text("Close") }
                }
                val previewScroll = rememberScrollState()
                Surface(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.small, border = BorderStroke(1.dp, BorderColor)) {
                    Row(Modifier.heightIn(min=48.dp).padding(horizontal=8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if(previewScroll.maxValue > 0) "Preview ↔" else "Preview", color = MutedColor, style = MaterialTheme.typography.labelLarge)
                        Text(preview, Modifier.weight(1f).padding(start = 12.dp).horizontalScroll(previewScroll)
                            .semantics { contentDescription = "Chord preview $preview" }, maxLines=1, style = MaterialTheme.typography.headlineSmall)
                    }
                }
                Column(Modifier.weight(1f, fill = false).verticalScroll(scroll), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    ChordDurationSlider(state, model, selected?.ticks ?: editor.pending?.duration ?: editor.duration, selected != null && editor.pending == null)
                    ChordBuilder(draft) { draft = it }
                    editor.chordDialogError?.let { Text(it, color = MutedColor, style = MaterialTheme.typography.bodySmall) }
                }
                if (scroll.maxValue > 0) Text(if(scroll.value < scroll.maxValue) "Scroll for more chord controls ↓" else "Scroll to root and type ↑", Modifier.align(Alignment.CenterHorizontally), color=MutedColor, style=MaterialTheme.typography.labelSmall)
                HorizontalDivider(color = BorderColor)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    val action = if(density.fontScale > 1.2f) Modifier.weight(1f).heightIn(min=48.dp) else Modifier.heightIn(min=48.dp)
                    if (selected != null) TextButton(onClick = { model.deleteChord(); model.closeChordDialog() }, enabled = !state.busy, modifier = action) { Text("Delete") }
                    else if (editor.pending != null) TextButton(onClick = { model.discardPending(); model.closeChordDialog() }, modifier = action) { Text("Discard") }
                    if(density.fontScale <= 1.2f) Spacer(Modifier.weight(1f))
                    TextButton(model::closeChordDialog, modifier = action) { Text("Cancel") }
                    Button(onClick = { model.applyChordDefinition(draft) }, enabled = !state.busy && runCatching { draft.validate() }.isSuccess,
                        modifier = action, shape = MaterialTheme.shapes.small) { Text(if (selected != null || editor.pending?.replaceId != null) "Apply" else "Add") }
                }
            }
        }
        }
    }
    }
}

@Composable
@OptIn(ExperimentalComposeUiApi::class)
private fun ChordDurationSlider(state: LibraryState, model: LibraryViewModel, ticks: Int, selected: Boolean) {
    val score = state.editor!!.score
    val choices = remember(score.timeSignature, ticks) { ChordTimeline.durations(score, ticks) }
    var preview by remember(ticks, state.editor.selectedId) { mutableStateOf(ticks) }
    var cancelled by remember { mutableStateOf(false) }
    var pointerActive by remember { mutableStateOf(false) }
    val targetId = if (selected) state.editor.selectedId else null
    val interactions = remember { MutableInteractionSource() }
    LaunchedEffect(interactions,ticks,targetId) { interactions.interactions.collect { interaction ->
        when(interaction) {
            is DragInteraction.Start -> { pointerActive = true; cancelled = false }
            is DragInteraction.Cancel -> { pointerActive = false; cancelled = true; preview = ticks }
            is DragInteraction.Stop -> { if(pointerActive && !cancelled) model.setChordDialogDuration(preview,targetId); pointerActive = false }
            else -> Unit
        }
    } }
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Duration", style = MaterialTheme.typography.labelLarge)
            Text(ChordTimeline.durationLabel(score, preview), style = MaterialTheme.typography.labelLarge, color = AccentColor)
        }
        Slider(value = choices.indexOf(preview).coerceAtLeast(0).toFloat(), onValueChange = { if(!pointerActive) cancelled = false; preview = choices[it.roundToInt()] },
            // A canceled drag can finish before the Cancel interaction, without a
            // MotionEvent reaching the spy. Active touches commit only on release/Stop.
            // Keyboard and accessibility edits have no active pointer and finish here.
            onValueChangeFinished = { val completed = preview; val abort = cancelled
                if (!pointerActive) { cancelled = false; if (abort) preview = ticks else model.setChordDialogDuration(completed, targetId) } }, valueRange = 0f..choices.lastIndex.coerceAtLeast(1).toFloat(), steps = (choices.size - 2).coerceAtLeast(0),
            enabled = !state.busy && choices.size > 1, interactionSource = interactions,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = if (selected) "Selected chord duration" else "New chord duration"; stateDescription = ChordTimeline.durationLabel(score, preview) }
                .motionEventSpy { event -> when(event.actionMasked) { MotionEvent.ACTION_DOWN -> { pointerActive = true; cancelled = false }; MotionEvent.ACTION_UP -> pointerActive = false; MotionEvent.ACTION_CANCEL -> { pointerActive = false; cancelled = true; preview = ticks } } }
                .onPreviewKeyEvent { if (it.key == Key.Escape) { preview = ticks; model.closeChordDialog(); true } else false })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choices(label: String, values: List<String>, selected: (String) -> Boolean, choose: (String) -> Unit) = Choices(label,values,selected,choose,false)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choices(label: String, values: List<String>, selected: (String) -> Boolean, choose: (String) -> Unit, inline:Boolean) {
    if(inline && LocalDensity.current.fontScale <= 1.2f) Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
        Text(label,Modifier.width(88.dp),color=MutedColor,style=MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)) { values.forEach { value -> Choice(label,value,selected(value)) { choose(value) } } }
    } else Column {
        Text(label,color=MutedColor,style=MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)) { values.forEach { value -> Choice(label,value,selected(value)) { choose(value) } } }
    }
}

@Composable
private fun Choice(label:String,value:String,selected:Boolean,choose:()->Unit) {
    Surface(onClick=choose,shape=MaterialTheme.shapes.small,color=if(selected) AccentColor else PaperColor,
        contentColor=if(selected) androidx.compose.ui.graphics.Color.White else MutedColor,border=BorderStroke(1.dp,if(selected) AccentColor else BorderColor),
        modifier=Modifier.heightIn(min=48.dp).widthIn(min=48.dp).semantics { contentDescription="$label $value"; this.selected=selected }) {
        Box(Modifier.padding(horizontal=8.dp),contentAlignment=Alignment.Center) { Text(value,style=MaterialTheme.typography.bodyMedium) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChordBuilder(value: ChordDefinition, change: (ChordDefinition) -> Unit) {
    var part by remember { mutableIntStateOf(0) }
    var rare by remember { mutableStateOf(false) }
    var toneChooser by remember { mutableStateOf<String?>(null) }
    val component = if (value.kind == "polychord") value.components[part.coerceIn(value.components.indices)] else value
    fun set(d: ChordDefinition) { if (value.kind == "polychord") change(value.copy(components = value.components.mapIndexed { i, c -> if (i == part) d else c })) else change(d) }
    fun tonal() = if (component.kind == "tonal") component else ChordDefinition(root = component.root ?: ChordSpelling(), bass = component.bass)
    if (value.kind == "polychord") {
        Choices("Stack component", value.components.indices.map { "${it + 1}: ${value.components[it].symbol}" }, { it.startsWith("${part + 1}:") }) { part = it.substringBefore(':').toInt() - 1 }
        Row {
            if (value.components.size < 4) TextButton({ change(value.copy(components = value.components + ChordDefinition())); part = value.components.size }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Add component") }
            TextButton({ change(if (value.components.size == 2) value.components[1 - part].copy(bass = value.bass) else value.copy(components = value.components.filterIndexed { i, _ -> i != part })); part = 0 }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Remove component") }
        }
    }
    val root = component.root ?: ChordSpelling()
    fun rootStep(step:String) { set(if (component.kind == "none") ChordDefinition(root=ChordSpelling(step)) else component.copy(root=root.copy(step=step))) }
    fun accidental(s:String) {
        val alter = listOf(-1,0,1,-2,2)[listOf("♭","♮","♯","♭♭","♯♯").indexOf(s)]
        set(if (component.kind == "none") ChordDefinition(root = root.copy(alter = alter)) else component.copy(root = root.copy(alter = alter)))
    }
    val largeText = LocalDensity.current.fontScale > 1.2f
    val roots: @Composable () -> Unit = {
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)) {
            "CDEFGAB".forEach { note -> Choice("Root",note.toString(),root.step==note.toString()) { rootStep(note.toString()) } }
            listOf("♭","♮","♯").forEachIndexed { i,s -> Choice("Accidental",s,root.alter==i-1) { accidental(s) } }
        }
    }
    if(largeText) Column {
        Text("Root",color=MutedColor,style=MaterialTheme.typography.labelLarge)
        roots()
    } else Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
        Text("Root",Modifier.width(36.dp),color=MutedColor,style=MaterialTheme.typography.labelLarge)
        roots()
    }
    val common = listOf("Major","Minor","7","maj7","m7","dim","aug","sus2","sus4")
    fun preset(label: String): ChordDefinition = when (label) {
        "Minor" -> ChordDefinition(family = "minor"); "7" -> ChordDefinition(seventh = "dominant"); "maj7" -> ChordDefinition(seventh = "major"); "m7" -> ChordDefinition(family = "minor", seventh = "dominant")
        "dim" -> ChordDefinition(family = "diminished"); "aug" -> ChordDefinition(family = "augmented"); "sus2","sus4" -> ChordDefinition(family = label)
        "Power 5" -> ChordDefinition(family = "power"); "dim7" -> ChordDefinition(family = "diminished", seventh = "diminished"); "m7b5" -> ChordDefinition(family = "diminished", seventh = "dominant")
        "m(maj7)" -> ChordDefinition(family = "minor", seventh = "major"); "7sus4" -> ChordDefinition(family = "sus4", seventh = "dominant"); "7sus2" -> ChordDefinition(family = "sus2", seventh = "dominant")
        "N.C." -> ChordDefinition(kind = "none", root = null, family = null); else -> ChordDefinition()
    }
    fun isType(label: String): Boolean { val p = preset(label); return component.kind == p.kind && component.family == p.family && component.seventh == p.seventh }
    fun type(label: String) { val p = preset(label); set(if (p.kind == "none") p else p.copy(root = root, bass = component.bass, additions = component.additions, alterations = component.alterations, omissions = component.omissions)) }
    if(largeText) Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Text("Type",color=MutedColor,style=MaterialTheme.typography.labelLarge)
            TextButton({rare=!rare},Modifier.size(48.dp).semantics { contentDescription="Additional types" },contentPadding=PaddingValues(0.dp)) { Text("⋯") }
        }
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            common.forEach { label -> Choice("Type",label,isType(label)) { type(label) } }
        }
        if(value.kind != "polychord" && component.kind != "none") BassChoice(component.bass) { set(component.copy(bass=it)) }
    } else Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)) {
        Column(Modifier.width(48.dp),horizontalAlignment=Alignment.CenterHorizontally) {
            Text("Type",color=MutedColor,style=MaterialTheme.typography.labelLarge)
            TextButton({rare=!rare},Modifier.size(48.dp).semantics { contentDescription="Additional types" },contentPadding=PaddingValues(0.dp)) { Text("⋯") }
        }
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            common.chunked(5).forEach { row -> FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)) { row.forEach { label -> Choice("Type",label,isType(label)) { type(label) } } } }
        }
        if(value.kind != "polychord" && component.kind != "none") Column(Modifier.width(88.dp)) { BassChoice(component.bass) { set(component.copy(bass=it)) } }
    }
    if (rare) {
        Choices("Spelling",listOf("♭","♮","♯","♭♭","♯♯"),{ listOf(-1,0,1,-2,2)[listOf("♭","♮","♯","♭♭","♯♯").indexOf(it)]==root.alter },::accidental)
        Choices("Additional type",listOf("Power 5","dim7","m7b5","m(maj7)","7sus4","7sus2","N.C."),::isType,::type)
    }
    if (value.kind == "polychord") {
        BassChoice(component.bass, "Component bass") { set(component.copy(bass = it)) }
        BassChoice(value.bass, "Stack bass") { change(value.copy(bass = it)) }
    }
    HorizontalDivider(color = BorderColor)
    Choices("Extensions", listOf("6","6/9","9","11","13"), { component.extension == it }, { e ->
        val d = tonal(); val ext = if (d.extension == e) null else e
        set(d.copy(extension = ext, seventh = if (ext in listOf("6","6/9")) null else if (ext != null) d.seventh ?: "dominant" else d.seventh))
    },inline=true)
    val alterations = listOf(ChordDegree(5,-1),ChordDegree(5,1),ChordDegree(9,-1),ChordDegree(9,1),ChordDegree(11,1),ChordDegree(13,-1))
    Choices("Alterations",alterations.map { it.label },{ s -> component.alterations.any { it.label==s } },{ s -> val d=tonal();val degree=alterations.first { it.label==s };set(d.copy(alterations=if(degree in d.alterations) d.alterations-degree else d.alterations+degree)) },inline=true)
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton({ toneChooser = if (toneChooser == "Alter degree") null else "Alter degree" }, modifier = Modifier.weight(1f).heightIn(min = 48.dp),contentPadding=PaddingValues(4.dp)) { Text("Alter degree ▾") }
        OutlinedButton({ toneChooser = if (toneChooser == "Add tone") null else "Add tone" }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Add tone ▾") }
        OutlinedButton({ toneChooser = if (toneChooser == "Omit tone") null else "Omit tone" }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Omit tone ▾") }
    }
    if(component.additions.isNotEmpty() || component.omissions.isNotEmpty()) Text((component.additions.map { "add${it.label}" } + component.omissions.map { "no$it" }).joinToString(" · "),color=MutedColor,style=MaterialTheme.typography.bodySmall)
    if (toneChooser != null) DegreeChooser(toneChooser!!, component, ::set)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton({ set(if (component.kind == "custom") ChordDefinition(root = root, bass = component.bass) else ChordDefinition(kind = "custom", root = root, family = null, tones = component.pitchClasses(false).map { chordMod(it - root.pitchClass) }.distinct().sorted(), bass = component.bass)) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Custom tones") }
        OutlinedButton({ if (value.kind != "polychord") { change(ChordDefinition(kind = "polychord", root = null, family = null, components = listOf(value.copy(bass = null).takeIf { it.kind != "none" } ?: ChordDefinition(), ChordDefinition(root = ChordSpelling("D"))), bass = value.bass)); part = 1 } }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Polychord") }
    }
    if (component.kind == "custom") Choices("Custom interval", (0..11).map { it.toString() }, { it.toInt() in component.tones }) { s -> val n = s.toInt(); val tones = if (n in component.tones) component.tones - n else component.tones + n; if (tones.isNotEmpty()) set(component.copy(tones = tones.sorted())) }
}

@Composable
private fun DegreeChooser(title: String, component: ChordDefinition, change: (ChordDefinition) -> Unit) {
    var degree by remember(title) { mutableIntStateOf(9) }
    var alter by remember(title) { mutableIntStateOf(0) }
    val d = if (component.kind == "tonal") component else ChordDefinition(root = component.root ?: ChordSpelling(), bass = component.bass)
    Choices("Degree", (1..13).map { it.toString() }, { it.toInt() == degree }) { degree = it.toInt() }
    if (title != "Omit tone") Choices("Tone accidental", listOf("bb","b","natural","#","##"), { listOf("bb","b","natural","#","##").indexOf(it) - 2 == alter }) { alter = listOf("bb","b","natural","#","##").indexOf(it) - 2 }
    val tone = ChordDegree(degree, alter)
    OutlinedButton({ change(if (title == "Omit tone") d.copy(omissions = if (degree in d.omissions) d.omissions - degree else d.omissions + degree)
        else if (title == "Alter degree") d.copy(alterations = if (tone in d.alterations) d.alterations - tone else d.alterations + tone)
        else d.copy(additions = if (tone in d.additions) d.additions - tone else d.additions + tone)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (title == "Omit tone") "Toggle no$degree" else if (title == "Alter degree") "Toggle ${tone.label}" else "Toggle add${tone.label}") }
}

@Composable
private fun BassChoice(bass: ChordSpelling?, label: String = "Bass", choose: (ChordSpelling?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    var step by remember(bass) { mutableStateOf(bass?.step ?: "C") }
    Column {
      if(label=="Bass") Text(label,color=MutedColor,style=MaterialTheme.typography.labelLarge)
      Row(verticalAlignment = Alignment.CenterVertically) {
        if(label!="Bass") Text(label, Modifier.weight(1f), color = MutedColor, style = MaterialTheme.typography.labelLarge)
        Box {
            OutlinedButton({ expanded = true }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "$label ${bass?.label ?: "Root"}" }) { Text("${bass?.label ?: "Root"} ▾") }
            DropdownMenu(expanded, { expanded = false }) {
                DropdownMenuItem(text = { Text("Root") }, onClick = { choose(null); expanded = false })
                Choices("Bass note", "CDEFGAB".map { it.toString() }, { it == step }) { step = it; choose(ChordSpelling(it)); expanded = false }
                listOf(-2,-1,0,1,2).forEach { alter -> val note = ChordSpelling(step, alter)
                    DropdownMenuItem(text = { Text(note.label) }, onClick = { choose(note); expanded = false })
                }
            }
        }
      }
    }
}
