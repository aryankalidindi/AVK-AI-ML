<%*
// 1. Get today's date in MM-DD-YYYY format
let today = tp.date.now("MM-DD-YYYY");

// 2. Ask you what you want to name your new note
let noteName = await tp.system.prompt("Enter note title:");

// 3. Move the note into the correct daily folder automatically
await tp.file.move(today + "/" + noteName);
-%>
