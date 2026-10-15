// AEOM landing kit: the small behaviours the kit's components need.

// The eyes are alive: they follow the pointer while it moves, look around on
// their own when it rests (and on a phone), and blink when the visitor
// clicks. Nothing moves for a visitor who asks for less motion.
const eyes = [...document.querySelectorAll(".eye")];
if (eyes.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const look = (eye, x, y) => {
    const pupil = eye.querySelector("i");
    pupil.style.setProperty("--px", `${x}%`);
    pupil.style.setProperty("--py", `${y}%`);
  };
  let resting;
  const wander = () => {
    for (const eye of eyes) {
      eye.classList.remove("is-following");
      const angle = Math.random() * Math.PI * 2;
      const reach = 10 + Math.random() * 20;
      look(eye, Math.cos(angle) * reach, Math.sin(angle) * reach);
    }
    resting = setTimeout(wander, 900 + Math.random() * 1600);
  };
  addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    clearTimeout(resting);
    for (const eye of eyes) {
      eye.classList.add("is-following");
      const box = eye.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const far = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, far / 300) * 28;
      look(eye, (dx / far) * reach, (dy / far) * reach);
    }
    resting = setTimeout(wander, 2500);
  });
  wander();
  // The eyes blink when the visitor clicks, anywhere on the page.
  addEventListener("pointerdown", () => {
    for (const eye of eyes) {
      eye.classList.remove("is-blinking");
      void eye.offsetWidth;
      eye.classList.add("is-blinking");
    }
  });
}

// Shapes that do not go together fall in order when they come into view, and
// again every five seconds; without motion, they are shown in order.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
for (const tidy of document.querySelectorAll(".tidy")) {
  if (reduced || !("IntersectionObserver" in window)) {
    tidy.classList.add("is-tidy");
    continue;
  }
  // While in view, every five seconds: in order, then back to the mess, then in order again.
  let cycle;
  const play = () => {
    tidy.classList.remove("is-tidy");
    setTimeout(() => tidy.classList.add("is-tidy"), 1100);
  };
  new IntersectionObserver(([entry]) => {
    clearInterval(cycle);
    if (!entry.isIntersecting) return;
    play();
    cycle = setInterval(play, 5000);
  }, { threshold: 0.5 }).observe(tidy);
}
// The eye that walks the journey stands still for a visitor who asks for less motion,
// where its walk ends.
if (reduced) {
  for (const motion of document.querySelectorAll("animateMotion")) {
    const path = document.querySelector(motion.querySelector("mpath")?.getAttribute("href") ?? "");
    if (path?.getTotalLength) {
      const end = path.getPointAtLength(path.getTotalLength());
      motion.parentElement.setAttribute("transform", `translate(${end.x} ${end.y})`);
    }
    motion.remove();
  }
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
      // No count, or none yet: a bare "0" reads as a counter that did not load.
      if (!Number.isInteger(data?.stars) || data.stars < 1) return;
      count.textContent = data.stars.toLocaleString("en");
      count.hidden = false;
      const link = count.closest("a");
      if (link) link.setAttribute("aria-label", `${link.firstChild.textContent.trim()}, ${count.textContent} ${data.stars === 1 ? "star" : "stars"}`);
    })
    .catch(() => {});
}
