
  const entryRoot = document.documentElement;
  const entryScene = document.querySelector(".entry-scene");
  const entryImages = [...entryScene.querySelectorAll("img")];
  for (const [property, layer] of [["--ribbon-art", ".entry-ribbons"], ["--doodle-art", ".entry-doodles"]]) {
    entryScene.style.setProperty(property, 'url("' + entryScene.querySelector(layer).src + '")');
  }
  const entrySoundSlot = document.querySelector("#entry-sound");
  const studioSoundSlot = soundButton.parentElement;
  setupEntryJelly(entryScene.querySelector(".entry-cat"));
  let hasPlayedWelcome = false;
  function showEntry(route) {
    const welcome = route === "welcome";
    entryRoot.dataset.jellyView = welcome ? "entry" : "app";
    const soundSlot = welcome ? entrySoundSlot : studioSoundSlot;
    if (soundButton.parentElement !== soundSlot) soundSlot.prepend(soundButton);
    if (welcome && !hasPlayedWelcome) {
      hasPlayedWelcome = true;
      Promise.allSettled(entryImages.map((image) => image.decode()))
        .then(() => entryScene.classList.add("entry-ready"));
    }
    return welcome;
  }

