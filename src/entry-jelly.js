
  function setupEntryJelly(control) {
    const art = control.querySelector(".entry-cat-art");
    const image = art.querySelector("img");
    const canvas = art.querySelector("canvas");
    const pointers = new Map();
    let buffer, animation, frame = 0;

    function getSurface() {
      if (buffer) return buffer;
      if (!image.complete || !image.naturalWidth) return null;
      const side = 360;
      const padding = Math.round(side * .16);
      const size = side + 2 * padding;
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently:true });
      if (!context) return null;
      context.drawImage(image, padding, padding, side, side);
      const warped = context.getImageData(0, 0, size, size);
      buffer = { context, side, size, padding, warped, original:new Uint8ClampedArray(warped.data), previous:null };
      return buffer;
    }

    function finishEntrance() {
      for (const effect of control.getAnimations()) {
        if (effect.animationName === "entry-cat-rebound" && effect.playState === "running") effect.finish();
      }
    }

    function poke() {
      playSound("tap");
      finishEntrance();
      animation?.cancel();
      if (reducedMotion.matches) {
        animation = art.animate([{ opacity:.83 }, { opacity:1 }], { duration:160 });
        return;
      }
      animation = art.animate([
        { transform:"scale(1.08,.88)" },
        { transform:"scale(.97,1.065)", offset:.39 },
        { transform:"scale(1.023,.973)", offset:.66 },
        { transform:"scale(1)" }
      ], { duration:395, easing:"cubic-bezier(.2,.75,.35,1)" });
    }

    function draw(now) {
      frame = 0;
      const poses = [];
      let active = false, lean = 0;
      for (const [id, pointer] of pointers) {
        if (!pointer.pulled) continue;
        if (pointer.released) {
          const elapsed = now - pointer.released;
          if (elapsed >= 470 || reducedMotion.matches) {
            pointers.delete(id);
            continue;
          }
          const settle = Math.exp(-elapsed / 105) * Math.cos(elapsed / 63);
          pointer.x = pointer.releaseX * settle;
          pointer.y = pointer.releaseY * settle;
          active = true;
        } else {
          pointer.x += (pointer.targetX - pointer.x) * .54;
          pointer.y += (pointer.targetY - pointer.y) * .54;
          active ||= Math.hypot(pointer.targetX - pointer.x, pointer.targetY - pointer.y) > .12;
        }
        poses.push(pointer);
        lean += pointer.x;
      }
      if (poses.length && !reducedMotion.matches) {
        deformSurface(buffer, buffer.original, poses);
        control.classList.add("is-pulled");
        const angle = Math.min(3.4, Math.max(-3.4, lean / buffer.side * 38));
        art.style.transform = "rotate(" + angle + "deg)";
      } else {
        control.classList.remove("is-pulled");
        art.style.transform = "";
        if (buffer?.previous) {
          deformSurface(buffer, buffer.original, []);
          buffer.previous = null;
        }
      }
      if (active) frame = requestAnimationFrame(draw);
    }

    function requestFrame() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function hasPull() {
      return [...pointers.values()].some((pointer) => pointer.pulled && !pointer.released);
    }

    control.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || pointers.size >= 5) return;
      const surface = getSurface();
      if (!surface) return;
      const hit = control.getBoundingClientRect();
      if (hit.width < 4) return;
      const u = (event.clientX - hit.left) / hit.width;
      const v = (event.clientY - hit.top) / hit.height;
      const originX = surface.padding + u * surface.side;
      const originY = surface.padding + v * surface.side;
      const index = (Math.round(originY) * surface.size + Math.round(originX)) * 4 + 3;
      if (!(surface.original[index] > 38)) return;
      finishEntrance();
      animation?.cancel();
      const box = control.getBoundingClientRect();
      pointers.set(event.pointerId, {
        clientX:event.clientX, clientY:event.clientY, width:box.width, originX, originY,
        interior:interiorDepth(surface, originX, originY), x:0, y:0, targetX:0, targetY:0
      });
      control.setPointerCapture(event.pointerId);
    });
    control.addEventListener("pointermove", (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer || pointer.released) return;
      const dx = event.clientX - pointer.clientX;
      const dy = event.clientY - pointer.clientY;
      const distance = Math.hypot(dx, dy);
      if (distance < 5 && !pointer.pulled) return;
      const starting = !pointer.pulled && !hasPull();
      pointer.pulled = true;
      if (starting) playSound("stretch");
      if (reducedMotion.matches) return;
      const reach = buffer.side * .095 * Math.tanh(distance / (pointer.width * .13));
      pointer.targetX = dx * reach / (distance || 1);
      pointer.targetY = dy * reach / (distance || 1);
      requestFrame();
    });

    function release(event, cancelled) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer || pointer.released) return;
      if (!pointer.pulled) {
        pointers.delete(event.pointerId);
        if (!cancelled && !pointers.size) poke();
        return;
      }
      if (reducedMotion.matches) pointers.delete(event.pointerId);
      else {
        pointer.released = performance.now();
        pointer.releaseX = pointer.x || pointer.targetX * .5;
        pointer.releaseY = pointer.y || pointer.targetY * .5;
        requestFrame();
      }
      if (hasPull()) return;
      if (cancelled) stopSound();
      else playSound("rebound");
    }

    control.addEventListener("pointerup", (event) => release(event, false));
    control.addEventListener("pointercancel", (event) => release(event, true));
    control.addEventListener("lostpointercapture", (event) => release(event, true));
    control.addEventListener("click", (event) => {
      if (event.detail === 0 && !pointers.size) poke();
    });
  }

