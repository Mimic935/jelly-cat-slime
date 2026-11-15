
  function showGalleryZones(current) {
    const links = document.createElement("nav");
    links.className = "gallery-zone-nav";
    links.setAttribute("aria-label", "展区");
    zones.append(links);
    for (const [templateId, template] of templates) {
      const zone = document.createElement("section");
      zone.className = "gallery-zone";
      zone.dataset.template = templateId;
      const title = document.createElement("h2");
      title.id = "gallery-zone-" + templateId;
      title.textContent = template.name;
      title.tabIndex = -1;
      zone.setAttribute("aria-labelledby", title.id);
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "gallery-button";
      jump.textContent = template.name;
      jump.addEventListener("click", () => {
        title.focus({preventScroll:true});
        zone.scrollIntoView();
      });
      links.append(jump);
      const status = document.createElement("p");
      status.className = "gallery-status";
      status.setAttribute("role", "status");
      const cards = document.createElement("div");
      cards.className = "gallery-grid";
      const loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.className = "gallery-button";
      loadMore.textContent = "加载更多";
      loadMore.setAttribute("aria-label", "加载更多" + template.name + "作品");
      loadMore.hidden = true;
      zone.append(title, status, cards, loadMore);
      zones.append(zone);

      let nextOffset = 0;
      async function load() {
        loadMore.disabled = true;
        status.textContent = "正在加载作品…";
        try {
          const query = new URLSearchParams({ template:templateId, offset:String(nextOffset) });
          const data = await galleryRequest("/api/works?" + query);
          if (current !== generation) return;
          for (const work of data.works) cards.append(workCard(work, false));
          nextOffset += data.works.length;
          status.textContent = nextOffset ? "" : "这个分区还没有作品。";
          loadMore.hidden = !data.more;
        } catch {
          if (current !== generation) return;
          status.textContent = "这个分区暂时加载失败。";
          loadMore.hidden = true;
        } finally {
          loadMore.disabled = false;
        }
      }
      loadMore.addEventListener("click", load);
      if (apiOrigin) void load();
    }
  }
