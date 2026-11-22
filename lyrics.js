/* lyrics.js — панель слідкування за словами пісні праворуч під час відтворення */
(() => {
    /*
     * Слова беруться з текстових файлів у папці LYRICS_FOLDER:
     *   lyrics/Aircraft.txt, lyrics/Joy Again.txt, lyrics/Капсайз.txt ...
     * Назва файлу = назва треку (як у #trackTitle) + ".txt", кодування UTF-8.
     * Також підійде ім'я аудіофайлу: track1.txt, track2.txt, track3.txt.
     * Усередині просто повний текст: рядки та порожні рядки між куплетами.
     *
     * LYRICS_DATA — необов'язкове перевизначення з кодом (рядок або масив [{ time, text }]
     * для точних таймінгів). Має пріоритет над файлами.
     */
    const LYRICS_FOLDER = "lyrics";
    const LYRICS_DATA = {};

    const style = document.createElement("style");
    style.id = "lyrics-drawer-styles";
    style.textContent = `
        .lyrics-drawer {
            position: fixed;
            top: 50%;
            right: max(18px, env(safe-area-inset-right));
            width: min(340px, calc(100vw - 32px));
            max-height: min(600px, 82dvh);
            background: rgba(10, 20, 14, 0.82);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border: 1px solid rgba(46, 232, 92, 0.28);
            border-radius: 24px;
            padding: 20px;
            box-shadow: 0 22px 54px rgba(0, 0, 0, 0.72), 0 0 24px rgba(46, 232, 92, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.09);
            z-index: 15;
            display: flex;
            flex-direction: column;
            gap: 14px;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translate3d(44px, -50%, 0) scale(0.96);
            transition:
                opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.48s cubic-bezier(0.34, 1.56, 0.64, 1),
                visibility 0.42s ease;
        }

        .lyrics-drawer.is-visible {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translate3d(0px, -50%, 0) scale(1);
        }

        .lyrics-drawer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(46, 232, 92, 0.16);
        }

        .lyrics-badge {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            color: #2ee85c;
            display: inline-flex;
            align-items: center;
            gap: 7px;
        }

        .lyrics-pulse {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #7aff47;
            box-shadow: 0 0 10px #7aff47;
            animation: lyricsDotPulse 1.6s ease-in-out infinite;
        }

        @keyframes lyricsDotPulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.35); opacity: 1; }
        }

        .lyrics-song-label {
            font-size: 12px;
            color: #94b8a0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 165px;
        }

        .lyrics-lines {
            position: relative;
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            scrollbar-width: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 8px 4px;
            mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%);
            -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%);
        }

        .lyrics-lines::-webkit-scrollbar {
            display: none;
        }

        .lyric-line {
            font-size: 14px;
            line-height: 1.45;
            font-weight: 500;
            color: rgba(148, 184, 160, 0.52);
            transition:
                color 0.35s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                text-shadow 0.35s ease;
            transform-origin: left center;
            cursor: pointer;
        }

        .lyric-gap {
            height: 10px;
            flex: 0 0 auto;
        }

        .lyric-line:hover {
            color: rgba(240, 253, 244, 0.85);
        }

        .lyric-line.active {
            color: #f0fdf4;
            font-weight: 700;
            font-size: 16px;
            transform: translateX(4px) scale(1.02);
            text-shadow: 0 0 16px rgba(122, 255, 71, 0.45);
        }

        .lyric-line.passed {
            color: rgba(148, 184, 160, 0.34);
        }

        @media (max-width: 960px) {
            .lyrics-drawer {
                top: auto;
                bottom: max(14px, env(safe-area-inset-bottom));
                right: 50%;
                max-height: 280px;
                transform: translate3d(50%, 36px, 0) scale(0.96);
            }

            .lyrics-drawer.is-visible {
                transform: translate3d(50%, 0px, 0) scale(1);
            }
        }
    `;
    document.head.appendChild(style);

    const drawer = document.createElement("aside");
    drawer.className = "lyrics-drawer";
    drawer.id = "lyricsDrawer";
    drawer.setAttribute("aria-label", "Текст пісні");
    drawer.innerHTML = `
        <div class="lyrics-drawer-header">
            <span class="lyrics-badge"><span class="lyrics-pulse"></span>Lyrics</span>
            <span class="lyrics-song-label" id="lyricsSongLabel"></span>
        </div>
        <div class="lyrics-lines" id="lyricsLines"></div>
    `;
    document.body.appendChild(drawer);

    const songLabelEl = document.getElementById("lyricsSongLabel");
    const linesContainer = document.getElementById("lyricsLines");
    const audioEl = document.getElementById("audioPlayer");
    const titleEl = document.getElementById("trackTitle");

    let activeTrackName = "";
    let currentLines = [];
    let lineEls = [];
    let activeIndex = -1;
    let timesReady = false;

    function getCurrentTrackTitle() {
        return (titleEl && titleEl.textContent ? titleEl.textContent.trim() : "") || "Track";
    }

    function parseText(text) {
        return String(text)
            .replace(/^\uFEFF/, "")
            .replace(/^\s*\n|\n\s*$/g, "")
            .split(/\r?\n/)
            .map((t) => ({ time: null, text: t.trim() }));
    }

    const textCache = {};

    async function loadLines(trackName) {
        const data = LYRICS_DATA[trackName];
        if (Array.isArray(data)) {
            return data.map((l) => ({ time: l.time, text: l.text }));
        }
        if (typeof data === "string") {
            return parseText(data);
        }
        if (!(trackName in textCache)) {
            // пробуємо: "Назва.txt", "Назва_з_підкресленнями.txt", потім за іменем аудіофайлу (track1.txt)
            const names = [trackName, trackName.replace(/\s+/g, "_")];
            try {
                if (typeof tracks !== "undefined" && Array.isArray(tracks)) {
                    const t = tracks.find((x) => x && x.title === trackName);
                    if (t && t.file) names.push(String(t.file).replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, ""));
                }
            } catch (e) { /* tracks недоступний */ }
            textCache[trackName] = null;
            for (const name of names) {
                try {
                    const res = await fetch(`${LYRICS_FOLDER}/${encodeURIComponent(name)}.txt`, { cache: "no-cache" });
                    if (res.ok) {
                        textCache[trackName] = await res.text();
                        break;
                    }
                } catch (e) { /* пробуємо наступну назву */ }
            }
        }
        const txt = textCache[trackName];
        if (txt && txt.trim()) return parseText(txt);
        return [
            { time: null, text: "Текст для цього треку ще не доданий" },
            { time: null, text: `Створи файл ${LYRICS_FOLDER}/${trackName}.txt` }
        ];
    }

    // Якщо таймінгів немає — розподіляємо рядки рівномірно по тривалості треку
    function ensureTimes() {
        if (timesReady) return;
        const needs = currentLines.some((l) => l.time == null && l.text);
        if (!needs) {
            timesReady = true;
            return;
        }
        const dur = audioEl && isFinite(audioEl.duration) ? audioEl.duration : 0;
        if (!dur) return;
        const real = currentLines.filter((l) => l.text && l.time == null);
        const start = Math.min(8, dur * 0.05);
        const end = Math.min(10, dur * 0.05);
        const step = (dur - start - end) / real.length;
        real.forEach((l, i) => {
            l.time = start + i * step;
        });
        timesReady = true;
    }

    function buildLines(lines) {
        currentLines = lines;
        activeIndex = -1;
        timesReady = false;
        linesContainer.innerHTML = "";
        lineEls = [];
        linesContainer.scrollTop = 0;

        currentLines.forEach((item) => {
            if (!item.text) {
                const gap = document.createElement("div");
                gap.className = "lyric-gap";
                linesContainer.appendChild(gap);
                lineEls.push(null);
                return;
            }
            const lineEl = document.createElement("div");
            lineEl.className = "lyric-line";
            lineEl.textContent = item.text;
            lineEl.addEventListener("click", () => {
                ensureTimes();
                if (audioEl && !isNaN(audioEl.duration) && item.time != null) {
                    audioEl.currentTime = item.time;
                }
            });
            linesContainer.appendChild(lineEl);
            lineEls.push(lineEl);
        });
        ensureTimes();
    }

    function renderTrackLyrics(trackName) {
        activeTrackName = trackName;
        songLabelEl.textContent = trackName;
        buildLines([{ time: null, text: "Завантаження тексту…" }]);

        loadLines(trackName).then((lines) => {
            if (trackName !== activeTrackName) return; // трек вже змінився
            buildLines(lines);
            if (audioEl) syncActiveLine(audioEl.currentTime || 0);
        });
    }

    function syncActiveLine(currentTime) {
        const title = getCurrentTrackTitle();
        if (title !== activeTrackName) {
            renderTrackLyrics(title);
        }

        if (!currentLines.length) return;
        ensureTimes();

        let nextIdx = -1;
        for (let i = 0; i < currentLines.length; i++) {
            const l = currentLines[i];
            if (!l.text || l.time == null) continue;
            if (currentTime >= l.time) {
                nextIdx = i;
            } else {
                break;
            }
        }

        if (nextIdx === activeIndex) return;
        activeIndex = nextIdx;

        lineEls.forEach((node, idx) => {
            if (!node) return;
            node.classList.toggle("active", idx === activeIndex);
            node.classList.toggle("passed", idx < activeIndex);
        });

        const activeNode = lineEls[activeIndex];
        if (activeNode) {
            const targetScroll =
                activeNode.offsetTop -
                linesContainer.clientHeight / 2 +
                activeNode.clientHeight / 2;
            linesContainer.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: "smooth"
            });
        }
    }

    function updateDrawerVisibility() {
        const playing = Boolean(audioEl && !audioEl.paused && !audioEl.ended);
        if (playing) {
            const title = getCurrentTrackTitle();
            if (title !== activeTrackName) {
                renderTrackLyrics(title);
            }
            syncActiveLine(audioEl ? audioEl.currentTime || 0 : 0);
            drawer.classList.add("is-visible");
        } else {
            drawer.classList.remove("is-visible");
        }
    }

    if (audioEl) {
        audioEl.addEventListener("loadedmetadata", () => { ensureTimes(); });
        audioEl.addEventListener("durationchange", () => { ensureTimes(); });
        audioEl.addEventListener("play", updateDrawerVisibility);
        audioEl.addEventListener("playing", updateDrawerVisibility);
        audioEl.addEventListener("pause", updateDrawerVisibility);
        audioEl.addEventListener("ended", updateDrawerVisibility);
        audioEl.addEventListener("timeupdate", () => {
            syncActiveLine(audioEl.currentTime || 0);
        });
    }

    if (titleEl && typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(() => {
            renderTrackLyrics(getCurrentTrackTitle());
            syncActiveLine(audioEl ? audioEl.currentTime || 0 : 0);
        });
        observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    renderTrackLyrics(getCurrentTrackTitle());
    updateDrawerVisibility();
})();