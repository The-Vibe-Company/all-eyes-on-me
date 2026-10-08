// AEOM landing kit: the small behaviours the kit's components need.

// A plate with two views: the slider moves the line between them.
for (const plate of document.querySelectorAll("[data-compare]")) {
  const view = plate.querySelector(".plate__view");
  const input = plate.querySelector(".compare__input");
  if (!view || !input) continue;
  const move = () => {
    view.style.setProperty("--split", `${input.value}%`);
    input.setAttribute("aria-valuetext", `${input.value}% visible light, ${100 - Number(input.value)}% infrared`);
  };
  input.addEventListener("input", move);
  move();
}

// Copies text with the Clipboard API, which needs a secure page and the
// permission, or else with the older copy command. Says whether it worked.
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!document.queryCommandSupported?.("copy")) return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0;";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

// A code block that can be copied in one click, its lines joined as typed.
for (const block of document.querySelectorAll("[data-copy]")) {
  const head = block.querySelector(".film__head");
  const pre = block.querySelector("pre");
  if (!head || !pre) continue;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  let reset;
  let clicks = 0;
  button.addEventListener("click", async () => {
    const click = ++clicks;
    clearTimeout(reset);
    const text = [...pre.querySelectorAll(".ln")].map((line) => line.textContent).join("\n");
    const copied = await copy(text);
    // A later click has taken over: its outcome, not this one, is shown.
    if (click !== clicks) return;
    clearTimeout(reset);
    if (copied) {
      button.textContent = "Copied";
      reset = setTimeout(() => (button.textContent = "Copy"), 1800);
    } else {
      // Nothing was copied: say so until the next click, with the code selected.
      getSelection()?.selectAllChildren(pre);
      button.textContent = "Select to copy";
    }
  });
  head.append(button);
}

// The star count next to "Star on GitHub", when the site knows it.
// /api/stars always answers; without a number the button stays as it is.
for (const count of document.querySelectorAll("[data-stars]")) {
  fetch("/api/stars")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!Number.isInteger(data?.stars)) return;
      count.textContent = data.stars.toLocaleString("en");
      count.hidden = false;
      const link = count.closest("a");
      if (link) link.setAttribute("aria-label", `${link.firstChild.textContent.trim()}, ${count.textContent} ${data.stars === 1 ? "star" : "stars"}`);
    })
    .catch(() => {});
}
