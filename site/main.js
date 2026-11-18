(() => {
  const repo = "quicio/catodo";
  const api = `https://api.github.com/repos/${repo}`;
  const formatter = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const dateOrFallback = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
  };

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  };

  const detectPlatform = () => {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    const ua = navigator.userAgent || "";
    if (/mac/i.test(platform) || /Macintosh/.test(ua)) return "mac";
    if (/linux/i.test(platform) || /Linux/.test(ua)) return "linux";
    return "unknown";
  };

  const setPrimaryDownload = () => {
    const platform = detectPlatform();
    const label = document.querySelector("[data-platform-label]");
    if (label) {
      const names = { mac: "para macOS", linux: "para Linux" };
      label.textContent = names[platform] || "para tu sistema";
    }
    document.querySelectorAll("[data-download]").forEach((row) => {
      row.removeAttribute("data-current");
    });
    const key = platform === "mac" ? "mac-arm" : platform;
    document.querySelector(`[data-download="${key}"]`)?.setAttribute("data-current", "true");
  };

  const summarize = (body) => {
    if (!body) return "Sin notas adicionales.";
    const text = body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[#>*_`~]/g, "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^[-|]+$/.test(line))
      .filter((line) => !/^full changelog:?$/i.test(line))
      .join(" ");
    return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text;
  };

  const updateAssets = (release) => {
    const assets = new Map(
      (release.assets || []).map((asset) => [asset.name, asset.browser_download_url]),
    );
    const version = String(release.tag_name || "").replace(/^v/, "");
    const find = (name) => assets.get(name);
    const findSuffix = (suffix) =>
      [...assets.entries()].find(([name]) => name.endsWith(suffix))?.[1];

    const links = {
      "mac-arm": find("Catodo-mac-arm64.zip") || findSuffix("-mac-arm64.zip"),
      linux: findSuffix("-linux-x86_64.AppImage") || release.html_url,
      source: findSuffix("-src.tar.gz") || release.html_url,
    };
    for (const [key, href] of Object.entries(links)) {
      const node = document.querySelector(`[data-download="${key}"]`);
      if (node && href) node.href = href;
    }

    const linuxLinks = {
      appimage: {
        href: findSuffix("-linux-x86_64.AppImage"),
        name: `Catodo-${version}-linux-x86_64.AppImage`,
      },
      deb: {
        href: findSuffix("-linux-amd64.deb"),
        name: `Catodo-${version}-linux-amd64.deb`,
      },
      rpm: {
        href: findSuffix(".x86_64.rpm"),
        name: `catodo-${version}-1.x86_64.rpm`,
      },
      arch: {
        href: findSuffix("-x86_64.pkg.tar.zst"),
        name: `catodo-${version}-1-x86_64.pkg.tar.zst`,
      },
    };
    for (const [key, item] of Object.entries(linuxLinks)) {
      const node = document.querySelector(`[data-linux-link="${key}"]`);
      if (!node) continue;
      if (item.href) node.href = item.href;
      if (version) node.textContent = item.name;
    }
  };

  const renderReleases = (releases) => {
    const list = document.getElementById("release-list");
    if (!list) return;
    list.replaceChildren();
    for (const release of releases) {
      if (!release || release.draft) continue;
      const row = document.createElement("li");
      row.className = "release-row";

      const time = document.createElement("time");
      time.dateTime = release.published_at || "";
      time.textContent = dateOrFallback(release.published_at);

      const tag = document.createElement("a");
      tag.className = "release-tag";
      tag.href = release.html_url;
      tag.textContent = release.tag_name || "release";

      const copy = document.createElement("div");
      const title = document.createElement("p");
      title.className = "release-title";
      title.textContent =
        release.name && release.name !== release.tag_name
          ? release.name
          : "Actualización de Cátodo";

      const summary = document.createElement("p");
      summary.className = "release-summary";
      summary.textContent = summarize(release.body) || "Notas de la versión en GitHub.";

      copy.append(title, summary);
      row.append(time, tag, copy);
      list.append(row);
    }
    if (!list.children.length) {
      const empty = document.createElement("li");
      empty.className = "release-placeholder";
      empty.textContent = "Todavía no hay versiones publicadas.";
      list.append(empty);
    }
  };

  const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  };

  const loadReleases = async () => {
    const list = document.getElementById("release-list");
    try {
      const [latest, recent] = await Promise.all([
        fetchJson(`${api}/releases/latest`),
        fetchJson(`${api}/releases?per_page=4`),
      ]);
      const version = String(latest.tag_name || "").replace(/^v/, "");
      if (version) setText("[data-version]", version);
      const published = dateOrFallback(latest.published_at);
      if (published) setText("[data-release-date]", `Publicada el ${published}`);
      updateAssets(latest);
      renderReleases(Array.isArray(recent) ? recent : [latest]);
    } catch {
      setText("[data-release-date]", "Consulta las novedades en GitHub");
      if (list) {
        list.replaceChildren();
        const fallback = document.createElement("li");
        fallback.className = "release-placeholder";
        const link = document.createElement("a");
        link.href = `https://github.com/${repo}/releases`;
        link.textContent = "Ver todas las versiones en GitHub";
        fallback.append("No pude cargar las novedades en este momento. ", link);
        list.append(fallback);
      }
    }
  };

  setPrimaryDownload();
  loadReleases();
})();
