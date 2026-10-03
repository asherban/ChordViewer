# Create view visual specification

The [entry plan](../../create-entry-plan.md) defines the behavior. These specifications describe the current visual direction.

## Chord keyboard

- Use warm paper backgrounds, sage surfaces, dark green text and green action buttons. Use serif type for the score title and chord symbols, and sans-serif type for controls.
- Keep the active score position visible while the keyboard remains open during entry. The tutorial stays in its panel without a separate visibility row.
- Show recent chord shortcuts, root and quality keys, accidentals, slash bass controls, custom text entry, duration choices, Enter and Done.
- Show bar numbers and vertical separators in a chord-only score. Display a cursor and highlight the duration that the next chord will occupy.

## Direct stave entry

- Use the score itself for entry and show a clear line at the next note position.
- Show a ghost note and pitch label while the user places or drags a note.
- Place one duration slider beside the entry line or selected note, with nearby rest, accidental, tie and delete controls. Use a slim rounded track and a clear thumb.
- Label the slider with the selected note or “Next note” and display its current duration. Keep noteheads as the targets for pitch dragging.
- Keep notices outside the score layout and dismiss them automatically. Successful recovery writes remain silent.

### Duration interaction details

- The slider snaps to whole through sixteenth notes, plain or dotted once, plus undotted thirty-second notes. A tied note displays its combined duration.
- While adjusting a selected note, preview its notation without saving each intermediate value. Release commits one change, and Escape or a cancelled gesture restores the original duration.
- When no note is selected, the slider sets the duration for subsequent entries. Editing an existing note does not change that remembered setting.
- Support tapping the track and using arrow keys as alternatives to dragging. Expose the musical value to screen readers, rather than a numeric slider index.
- Keep the selected pitch and its beat visible while dragging. A completed edit does not need a separate confirmation message.

The chord image was generated with the built-in image generation tool. The stave image is a screenshot of the interaction study. The application must use its score renderer for accurate notation.
