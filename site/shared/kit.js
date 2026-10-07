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

// A code block that can be copied in one click, its lines joined as typed.
for (const block of document.querySelectorAll("[data-copy]")) {
  const head = block.querySelector(".film__head");
  const pre = block.querySelector("pre");
  if (!head || !pre) continue;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    const lines = [...pre.querySelectorAll(".ln")].map((line) => line.textContent);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select to copy";
    }
    setTimeout(() => (button.textContent = "Copy"), 1800);
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
