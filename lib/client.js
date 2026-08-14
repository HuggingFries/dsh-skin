window.__ModuleLoader__.load({
  id: "dsh-skin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // ── CSS 注入（常规插件无 styles 内建，用 document）──
    const insertCss = (css) => {
      const tag = document.createElement("style");
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => { if (tag.parentNode) tag.parentNode.removeChild(tag) };
    };

    // ── API（常规插件无 host.call，走 HTTP）──
    const api = {
      list: () => fetch("/dsh-skin-api/list").then((r) => r.json()),
      setDir: (path) => fetch("/dsh-skin-api/set-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then((r) => r.json()),
      save: (state) => fetch("/dsh-skin-api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }).then((r) => r.json()).catch(() => ({ ok: false })),
      load: () => fetch("/dsh-skin-api/load").then((r) => r.json()),
    };

    // ── 颜色工具 ──
    function hslc(h, s, l) {
      h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l))
      const a = s * Math.min(l, 1 - l)
      const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
      return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
    }
    const col = (h, s, l, alpha) => {
      const c = hslc(h, s, l)
      return alpha === undefined ? "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")" : "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + alpha + ")"
    }
    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      let h = 0, s = 0
      const l = (max + min) / 2
      if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
      }
      return { hue: h, sat: s }
    }
    const parseHex = (hex) => {
      const hx = (hex || "#e63946").replace("#", "")
      const r = parseInt(hx.slice(0, 2), 16)
      const g = parseInt(hx.slice(2, 4), 16)
      const b = parseInt(hx.slice(4, 6), 16)
      if (isNaN(r) || isNaN(g) || isNaN(b)) return { hue: 0, sat: 0.7 }
      const hsl = rgbToHsl(r, g, b)
      return { hue: hsl.hue, sat: Math.max(0.15, hsl.sat) }
    }

    // ── 插件级状态 ──
    let themeRef = null
    let workspacesRef = null
    let timerRef = null
    const imageList = []
    let currentDir = ""
    const perImage = {}
    const favorites = []
    let current = { name: "", dir: "" }
    let playing = false
    let favIndex = 0
    let slideTimer = null
    let slideIntervalMs = 10000
    let themeMode = "none"
    let transparency = 62
    let inputAlpha = 85             // 输入框透出度 0-100
    let bubbleAlpha = 82            // 气泡透出度 0-100
    let intensity = 40
    let customHex = "#e63946"
    let lastAuto = { hue: 28, sat: 0.4 }
    let onChange = null
    const notify = () => { if (onChange) onChange() }

    const PRESETS = {
      warm: { hue: 28, sat: 0.5 },
      cool: { hue: 205, sat: 0.45 },
      sakura: { hue: 335, sat: 0.32 },
      night: { hue: 225, sat: 0.3 },
    }

    const settingsFor = (name) => {
      let s = perImage[name]
      if (!s) { s = { fit: "cover", zoom: 100, x: null, y: null }; perImage[name] = s }
      return s
    }
    const defaultSettings = () => ({ fit: "cover", zoom: 100, x: null, y: null })

    // ── 背景样式 ──
    let disposeBg = null
    // 定位锚点：水平/垂直都以聊天列中心为基准 + 用户偏移
    // 自定义缩放用"高度百分比"（auto N%）：zoom=100 时图片恰好等于列高，上下边同时钉死；
    // 侧栏宽度变化不影响图片尺寸（列高恒定），图片只在聊天区重新水平居中
    const bgPos = (s) => "calc(50% + " + (s.x || 0) + "px) calc(50% + " + (s.y || 0) + "px)"
    const bgSize = (s) => s.fit === "contain" ? "contain" : s.fit === "custom" ? "auto " + Math.max(100, s.zoom || 100) + "%" : "cover"
    const bgCss = (name, dir, s) => {
      return `
        .pI_x6G_centerCol {
          background-image: url("/dsh-skin/${name}?d=${encodeURIComponent(dir)}") !important;
          background-size: ${bgSize(s)} !important;
          background-position: ${bgPos(s)} !important;
          background-repeat: no-repeat !important;
          background-attachment: scroll !important;
        }`
    }
    const setBackground = (name, dir, override) => {
      current = { name, dir }
      if (disposeBg) { try { disposeBg() } catch (_) { /* ignore */ } disposeBg = null }
      if (!name) { notify(); return }
      disposeBg = insertCss(bgCss(name, dir, override || settingsFor(name)))
      notify()
    }
    const refreshBackground = () => { if (current.name) setBackground(current.name, current.dir) }

    // ── 主题引擎 ──
    const buildTheme = (hue, sat, aL, aD, inten, inputA, bubbleA) => {
      const k = Math.max(0, Math.min(1, (inten || 0) / 100))
      const S = (base, span) => Math.min(1, sat * (base + span * k))
      const L = (hi, lo) => hi - (hi - lo) * k
      return {
        light: {
          "--dsw-alias-bg-base": col(hue, S(0.25, 0.65), L(0.96, 0.42), aL),
          "--dsw-alias-bg-layer-1": col(hue, S(0.22, 0.58), L(0.97, 0.48), 0.86),
          "--dsw-alias-bg-layer-2": col(hue, S(0.24, 0.60), L(0.94, 0.45), 0.90),
          "--dsw-alias-bg-layer-3": col(hue, S(0.26, 0.62), L(0.90, 0.42), 0.93),
          "--dsw-alias-bg-overlay": col(hue, S(0.25, 0.60), L(0.97, 0.46), 0.95),
          "--dsw-specific-sidebar-fill": col(hue, S(0.30, 0.70), L(0.94, 0.42), 0.78 + 0.12 * k),
          "--dsw-specific-input-major": col(hue, S(0.25, 0.50), L(0.96, 0.45), inputA),
          "--dsw-specific-bubble": col(hue, S(0.45, 0.50), L(0.94, 0.50), bubbleA),
          "--dsw-specific-bubble-highlight": col(hue, S(0.50, 0.55), L(0.90, 0.45), Math.min(1, bubbleA + 0.05)),
          "--anime-bubble-assistant": col(hue, S(0.45, 0.50), L(0.95, 0.55), bubbleA),
          "--anime-bubble-tool": col(hue + 45, S(0.40, 0.45), L(0.90, 0.55), 0.45),
          "--anime-tool-accent": col(hue + 45, Math.min(0.85, sat * 1.1), 0.45),
          "--dsw-alias-brand-primary": col(hue, Math.min(0.9, sat * 1.3), 0.48),
          "--dsw-alias-brand-text": col(hue, Math.min(0.7, sat), 0.35),
          "--dsw-alias-label-primary": "rgba(28, 30, 36, 0.94)",
          "--dsw-alias-label-secondary": "rgba(82, 88, 98, 0.78)",
          "--dsw-alias-border-l1": col(hue, S(0.4, 0.5), 0.45, 0.10),
          "--dsw-alias-border-l2": col(hue, S(0.4, 0.5), 0.35, 0.18),
        },
        dark: {
          "--dsw-alias-bg-base": col(hue, S(0.25, 0.60), L(0.08, 0.30), aD),
          "--dsw-alias-bg-layer-1": col(hue, S(0.22, 0.55), L(0.10, 0.28), 0.82),
          "--dsw-alias-bg-layer-2": col(hue, S(0.20, 0.50), L(0.13, 0.30), 0.86),
          "--dsw-alias-bg-layer-3": col(hue, S(0.18, 0.45), L(0.16, 0.32), 0.90),
          "--dsw-alias-bg-overlay": col(hue, S(0.20, 0.50), L(0.12, 0.28), 0.95),
          "--dsw-specific-sidebar-fill": col(hue, S(0.24, 0.62), L(0.09, 0.30), 0.80 + 0.12 * k),
          "--dsw-specific-input-major": col(hue, S(0.20, 0.40), L(0.10, 0.25), inputA),
          "--dsw-specific-bubble": col(hue, S(0.40, 0.50), L(0.14, 0.24), Math.min(1, bubbleA + 0.04)),
          "--dsw-specific-bubble-highlight": col(hue, S(0.45, 0.55), L(0.18, 0.26), Math.min(1, bubbleA + 0.08)),
          "--anime-bubble-assistant": col(hue, S(0.40, 0.50), L(0.15, 0.25), Math.min(1, bubbleA + 0.04)),
          "--anime-bubble-tool": col(hue + 45, S(0.35, 0.45), L(0.12, 0.22), 0.50),
          "--anime-tool-accent": col(hue + 45, Math.min(0.9, sat * 1.2), 0.62),
          "--dsw-alias-brand-primary": col(hue, Math.min(0.95, sat * 1.4), 0.62),
          "--dsw-alias-brand-text": col(hue, Math.min(0.8, sat * 1.1), 0.78),
          "--dsw-alias-label-primary": "rgba(240, 242, 246, 0.94)",
          "--dsw-alias-label-secondary": "rgba(180, 186, 196, 0.75)",
          "--dsw-alias-border-l1": col(hue, S(0.4, 0.5), 0.55, 0.12),
          "--dsw-alias-border-l2": col(hue, S(0.4, 0.5), 0.65, 0.20),
        },
      }
    }
    const veilOnly = (aL, aD, inputA, bubbleA) => ({
      light: {
        "--dsw-alias-bg-base": "rgba(248, 246, 240, " + aL + ")",
        "--dsw-specific-input-major": "rgba(248, 246, 240, " + inputA + ")",
        "--anime-bubble-assistant": "rgba(248, 246, 240, " + bubbleA + ")",
        "--anime-bubble-tool": "rgba(212, 219, 228, 0.45)",
        "--anime-tool-accent": "rgba(96, 125, 150, 0.9)",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(9, 11, 16, " + aD + ")",
        "--dsw-specific-input-major": "rgba(14, 16, 21, " + inputA + ")",
        "--anime-bubble-assistant": "rgba(14, 16, 21, " + bubbleA + ")",
        "--anime-bubble-tool": "rgba(30, 40, 56, 0.50)",
        "--anime-tool-accent": "rgba(110, 150, 190, 0.9)",
      },
    })

    let disposeThemeCss = null
    let disposeThemeTokens = null
    const applyTheme = (tokens) => {
      if (disposeThemeCss) { try { disposeThemeCss() } catch (_) { /* ignore */ } disposeThemeCss = null }
      if (disposeThemeTokens) { try { disposeThemeTokens() } catch (_) { /* ignore */ } disposeThemeTokens = null }
      if (!tokens) return
      if (themeRef != null) {
        const pair = {}
        for (const k of Object.keys(tokens.light)) {
          pair[k] = { light: tokens.light[k], dark: (tokens.dark && tokens.dark[k]) || tokens.light[k] }
        }
        disposeThemeTokens = themeRef.overrideTokens("dsh-skin-theme", pair)
      }
      const l = Object.entries(tokens.light).map((kv) => kv[0] + ": " + kv[1] + " !important").join("; ")
      const d = Object.entries(tokens.dark || {}).map((kv) => kv[0] + ": " + kv[1] + " !important").join("; ")
      disposeThemeCss = insertCss("html:root body { " + l + " } html:root body[data-ds-dark-theme] { " + d + " }")
    }
    const reapplyTheme = () => {
      const aL = Math.min(1, 0.08 + (transparency / 100) * 0.92)
      const aD = Math.min(1, transparency / 100)
      const inputA = Math.min(1, 0.35 + (inputAlpha / 100) * 0.6)
      const bubbleA = Math.min(1, 0.3 + (bubbleAlpha / 100) * 0.65)
      if (themeMode === "none") { applyTheme(veilOnly(aL, aD, inputA, bubbleA)); return }
      const p = PRESETS[themeMode]
      if (p) { applyTheme(buildTheme(p.hue, p.sat, aL, aD, intensity, inputA, bubbleA)); return }
      if (themeMode === "custom") {
        const c = parseHex(customHex)
        applyTheme(buildTheme(c.hue, c.sat, aL, aD, intensity, inputA, bubbleA))
        return
      }
      applyTheme(buildTheme(lastAuto.hue, lastAuto.sat, aL, aD, intensity, inputA, bubbleA))
    }

    // ── 收藏夹/播放 ──
    const stopSlide = () => { playing = false; if (slideTimer) { try { slideTimer() } catch (_) { /* ignore */ } slideTimer = null } }
    const startFavPlay = (immediate) => {
      if (!favorites.length) return
      stopSlide()
      playing = true
      favIndex = Math.max(0, favorites.findIndex((f) => f.name === current.name))
      if (immediate && favorites.length > 1) {
        favIndex = (favIndex + 1) % favorites.length
        setBackground(favorites[favIndex].name, currentDir, favorites[favIndex].settings)
      }
      if (timerRef != null) {
        slideTimer = timerRef.interval(() => {
          if (!favorites.length) { stopSlide(); notify(); return }
          if (favIndex >= favorites.length) favIndex = 0
          setBackground(favorites[favIndex].name, currentDir, favorites[favIndex].settings)
          favIndex = (favIndex + 1) % favorites.length
        }, slideIntervalMs)
      }
      notify()
    }
    const togglePlay = () => { if (playing) stopSlide(); else startFavPlay(true); saveState(); notify() }

    const toggleFavorite = (n) => {
      const i = favorites.findIndex((f) => f.name === n)
      if (i >= 0) favorites.splice(i, 1)
      else favorites.push({ name: n, settings: { ...settingsFor(n) } })
      saveState()
      notify()
    }
    const removeFavorite = (n) => { const i = favorites.findIndex((f) => f.name === n); if (i >= 0) { favorites.splice(i, 1); saveState(); notify() } }
    const clearFavorites = () => { favorites.length = 0; saveState(); notify() }

    const updateSettings = (name, patch) => {
      Object.assign(settingsFor(name), patch)
      // 收藏项实时同步当前调节结果，无需取消收藏再重新收藏
      const fav = favorites.find((f) => f.name === name)
      if (fav) fav.settings = { ...perImage[name] }
      if (current.name === name) refreshBackground()
      debouncedSave()
      notify()
    }
    const resetSettings = (name) => {
      delete perImage[name]
      const fav = favorites.find((f) => f.name === name)
      if (fav) fav.settings = null
      if (current.name === name) refreshBackground()
      saveState()
      notify()
    }
    const selectImage = (name) => { stopSlide(); setBackground(name, currentDir) }

    // ── 持久化 ──
    const saveState = () => {
      api.save({
        favorites,
        perImage,
        themeMode,
        transparency,
        inputAlpha,
        bubbleAlpha,
        intensity,
        customHex,
        dir: currentDir,
        name: current.name,
        intervalMs: slideIntervalMs,
        playing,
      })
    }
    let debouncedSave = saveState
    if (timerRef != null && typeof timerRef.debounce === "function") {
      debouncedSave = timerRef.debounce(saveState, 800)
    }
    const restore = async () => {
      try {
        const r = await api.load()
        if (!r || !r.ok || !r.state) { await loadList(); reapplyTheme(); return }
        const st = r.state
        if (Array.isArray(st.favorites)) {
          favorites.length = 0
          for (const f of st.favorites) if (f && f.name) favorites.push({ name: f.name, settings: f.settings || null })
        }
        if (st.perImage && typeof st.perImage === "object") {
          for (const k of Object.keys(st.perImage)) {
            const v = st.perImage[k]
            if (v && typeof v === "object" && typeof v.fit === "string") {
              perImage[k] = {
                fit: v.fit,
                zoom: typeof v.zoom === "number" ? v.zoom : 100,
                x: typeof v.x === "number" ? v.x : null,
                y: typeof v.y === "number" ? v.y : null,
              }
            }
          }
        }
        if (typeof st.transparency === "number") transparency = st.transparency
        if (typeof st.inputAlpha === "number") inputAlpha = st.inputAlpha
        if (typeof st.bubbleAlpha === "number") bubbleAlpha = st.bubbleAlpha
        if (typeof st.intensity === "number") intensity = st.intensity
        if (typeof st.customHex === "string" && /^#[0-9a-fA-F]{6}$/.test(st.customHex)) customHex = st.customHex
        if (typeof st.themeMode === "string" && (st.themeMode === "none" || st.themeMode === "auto" || st.themeMode === "custom" || PRESETS[st.themeMode])) themeMode = st.themeMode
        if (typeof st.intervalMs === "number") slideIntervalMs = st.intervalMs
        if (typeof st.dir === "string" && st.dir) {
          const s = await api.setDir(st.dir)
          if (s && s.ok === true) currentDir = st.dir
        }
        await loadList()
        if (typeof st.name === "string" && st.name && imageList.some((im) => im.name === st.name)) {
          setBackground(st.name, currentDir)
        }
        reapplyTheme()
        if (st.playing === true && favorites.length > 0) startFavPlay()
      } catch (err) {
        await loadList(); reapplyTheme()
      }
    }

    const loadList = async () => {
      const res = await api.list().catch(() => null)
      if (!res || !Array.isArray(res.images)) return
      imageList.length = 0
      for (const im of res.images) imageList.push(im)
      currentDir = res.dir || ""
      if (current.name && !imageList.some((im) => im.name === current.name)) current = { name: "", dir: currentDir }
      if (!current.name) {
        const wide = imageList.find((im) => im.width && im.height && im.width >= im.height * 1.4)
        if (wide) setBackground(wide.name, currentDir)
      }
      notify()
    }

    // ── 设置页组件 ──
    function BackgroundPicker() {
      const [name, setName] = React.useState(current.name)
      const [dir, setDir] = React.useState(currentDir)
      const [images, setImages] = React.useState([])
      const [favs, setFavs] = React.useState([])
      const [isPlaying, setIsPlaying] = React.useState(playing)
      const [intervalMs, setIntervalMs] = React.useState(slideIntervalMs)
      const [tMode, setTMode] = React.useState(themeMode)
      const [tTrans, setTTrans] = React.useState(transparency)
      const [tInput, setTInput] = React.useState(inputAlpha)
      const [tBubble, setTBubble] = React.useState(bubbleAlpha)
      const [tInt, setTInt] = React.useState(intensity)
      const [tColor, setTColor] = React.useState(customHex)
      const [st, setSt] = React.useState(name ? { ...settingsFor(name) } : null)
      const [busy, setBusy] = React.useState(false)
      const [drag, setDrag] = React.useState(null)
      const [error, setError] = React.useState(null)
      const els = React.useState(() => ({ img: null, cv: null }))[0]
      // 真实布局测量：完整框架（侧栏+聊天列+详情列）等比复刻实际页面，跨显示器实时跟随
      const [layout, setLayout] = React.useState(null)   // { frameW, frameH, colW, colH, sideW, detW }
      const [contW, setContW] = React.useState(0)        // 设置面板内容宽度

      const measure = React.useCallback(() => {
        if (typeof document === "undefined") return
        const frame = document.querySelector(".pI_x6G_frame")
        const col = document.querySelector(".pI_x6G_centerCol")
        if (!frame || !col) return
        const fr = frame.getBoundingClientRect()
        const cr = col.getBoundingClientRect()
        const side = document.querySelector(".pI_x6G_sidebarCol")
        const det = document.querySelector(".pI_x6G_detailsCol")
        const sr = side ? side.getBoundingClientRect() : { width: 0 }
        const dr = det ? det.getBoundingClientRect() : { width: 0 }
        const collapsed = frame.getAttribute("data-sidebar-collapsed") !== null
        setLayout((prev) => {
          const next = { frameW: fr.width, frameH: fr.height, colW: cr.width, colH: cr.height, sideW: sr.width, detW: dr.width, collapsed }
          if (prev && Math.abs(prev.frameW - next.frameW) < 1 && Math.abs(prev.frameH - next.frameH) < 1 && Math.abs(prev.colW - next.colW) < 1 && Math.abs(prev.sideW - next.sideW) < 1 && Math.abs(prev.detW - next.detW) < 1 && prev.collapsed === next.collapsed) return prev
          return next
        })
      }, [])

      React.useEffect(() => {
        measure()
        if (typeof ResizeObserver !== "undefined") {
          const frame = document.querySelector(".pI_x6G_frame")
          const side = document.querySelector(".pI_x6G_sidebarCol")
          const det = document.querySelector(".pI_x6G_detailsCol")
          const ro = new ResizeObserver(measure)
          if (frame) ro.observe(frame)
          if (side) ro.observe(side)
          if (det) ro.observe(det)
          const iv = setInterval(measure, 1500)
          return () => { ro.disconnect(); clearInterval(iv) }
        }
        if (typeof window !== "undefined") {
          window.addEventListener("resize", measure)
          const iv = setInterval(measure, 1500)
          return () => { window.removeEventListener("resize", measure); clearInterval(iv) }
        }
        return undefined
      }, [measure])

      const PREV_H = 240
      const scale = layout && layout.frameH > 0 ? Math.min(PREV_H / layout.frameH, (contW > 0 ? contW : 560) / layout.frameW) : 1
      const prevW = layout ? layout.frameW * scale : undefined
      const prevH = layout ? layout.frameH * scale : PREV_H
      const sideW = layout ? layout.sideW * scale : 0
      const detW = layout ? layout.detW * scale : 0
      // 收起侧栏时强制显示 56px 窄 rail（真实布局中侧栏列收起后保持 56px）
      const sideEff = layout && layout.collapsed ? Math.max(sideW, 56 * scale) : sideW
      const colLeft = sideEff
      const colRight = detW

      const sync = React.useCallback(() => {
        setName(current.name)
        setDir(currentDir)
        setImages([...imageList])
        setFavs([...favorites])
        setIsPlaying(playing)
        setIntervalMs(slideIntervalMs)
        setTMode(themeMode)
        setTTrans(transparency)
        setTInput(inputAlpha)
        setTBubble(bubbleAlpha)
        setTInt(intensity)
        setTColor(customHex)
        setSt(current.name ? { ...settingsFor(current.name) } : null)
      }, [])

      React.useEffect(() => {
        onChange = sync
        return () => { onChange = null }
      }, [sync])

      React.useEffect(() => {
        restore().then(sync).catch((err) => setError(String((err && err.message) || err)))
      }, [sync])

      const s = st || defaultSettings()
      const idx = images.findIndex((im) => im.name === name)

      const onDetectLoad = () => {
        try {
          if (!els.img || !els.cv) return
          const ctx2d = els.cv.getContext("2d")
          ctx2d.drawImage(els.img, 0, 0, 8, 8)
          const d = ctx2d.getImageData(0, 0, 8, 8).data
          let r = 0, g = 0, b = 0, n = 0
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
          const hsl = rgbToHsl(r / n, g / n, b / n)
          lastAuto = { hue: hsl.hue, sat: Math.max(0.15, Math.min(0.6, hsl.sat)) }
          if (themeMode === "auto") reapplyTheme()
        } catch (err) {
          lastAuto = { hue: 28, sat: 0.4 }
          if (themeMode === "auto") reapplyTheme()
        }
      }

      const doSelect = (n) => {
        selectImage(n)
        setName(n)
        setSt(n ? { ...settingsFor(n) } : null)
        setFavs([...favorites])
        saveState()
      }
      const doSelectFav = (f) => {
        stopSlide()
        setBackground(f.name, currentDir, f.settings)
        setName(f.name)
        setSt({ ...(f.settings || settingsFor(f.name)) })
        setIsPlaying(false)
      }
      const doStep = (delta) => {
        if (!images.length) return
        const i = images.findIndex((im) => im.name === name)
        doSelect(images[(i + delta + images.length) % images.length].name)
      }
      const doUpdate = (patch) => {
        if (!name) return
        updateSettings(name, patch)
        setSt({ ...perImage[name] })
      }
      const doReset = () => {
        if (!name) return
        resetSettings(name)
        setSt({ ...defaultSettings() })
      }
      const doToggleFav = () => { if (name) { toggleFavorite(name); setFavs([...favorites]) } }
      const doRemoveFav = (n) => { removeFavorite(n); setFavs([...favorites]) }
      const doClearFavs = () => {
        if (favorites.length === 0) return
        if (typeof window !== "undefined" && typeof window.confirm === "function") {
          if (!window.confirm("确定要清空收藏夹（共 " + favorites.length + " 张）吗？")) return
        }
        clearFavorites()
        setFavs([])
      }
      const doTogglePlay = () => { togglePlay(); setIsPlaying(playing); setFavs([...favorites]) }
      const doSetInterval = (v) => { slideIntervalMs = Number(v); if (playing) startFavPlay(); setIntervalMs(Number(v)); setIsPlaying(playing); saveState() }
      const doSetThemeMode = (m) => {
        themeMode = m
        reapplyTheme()
        setTMode(m)
        saveState()
      }
      const doSetTransparency = (v) => {
        transparency = Number(v)
        reapplyTheme()
        setTTrans(transparency)
        saveState()
      }
      const doSetInputAlpha = (v) => {
        inputAlpha = Number(v)
        reapplyTheme()
        setTInput(inputAlpha)
        saveState()
      }
      const doSetBubbleAlpha = (v) => {
        bubbleAlpha = Number(v)
        reapplyTheme()
        setTBubble(bubbleAlpha)
        saveState()
      }
      const doSetIntensity = (v) => {
        intensity = Number(v)
        reapplyTheme()
        setTInt(intensity)
        saveState()
      }
      const doSetCustomColor = (hex) => {
        customHex = hex
        if (themeMode === "custom") reapplyTheme()
        setTColor(hex)
        saveState()
      }

      const thumb = (n, size) => React.createElement("img", {
        src: "/dsh-skin-thumb/" + n + "?d=" + encodeURIComponent(dir),
        onError: (e) => {
          const el = e.currentTarget
          if (el && el.src.indexOf("/dsh-skin-thumb/") >= 0) {
            el.src = "/dsh-skin/" + n + "?d=" + encodeURIComponent(dir)
          }
        },
        decoding: "async",
        loading: "lazy",
        alt: n,
        title: n,
        style: { width: size, height: size, objectFit: "cover", borderRadius: 6, display: "block", pointerEvents: "none" },
      })

      const film = []
      if (images.length) {
        for (let i = Math.max(0, idx - 5); i <= Math.min(images.length - 1, idx + 5); i++) {
          const im = images[i]
          film.push(React.createElement("div", {
            key: im.name,
            onClick: () => doSelect(im.name),
            style: { border: im.name === name ? "2px solid var(--dsw-alias-brand-primary)" : "2px solid transparent", borderRadius: 6, padding: 1, cursor: "pointer", flex: "0 0 auto" },
          }, thumb(im.name, 52)))
        }
      }

      const favStrip = []
      for (const f of favorites) {
        favStrip.push(React.createElement("div", { key: f.name, style: { position: "relative", flex: "0 0 auto" } },
          React.createElement("div", {
            onClick: () => doSelectFav(f),
            style: { cursor: "pointer", border: f.name === name ? "2px solid var(--dsw-alias-brand-primary)" : "2px solid transparent", borderRadius: 6, padding: 1 },
          }, thumb(f.name, 48)),
          React.createElement("button", {
            onClick: (e) => { e.stopPropagation(); doRemoveFav(f.name) },
            title: "取消收藏",
            style: { position: "absolute", top: 0, right: 0, width: 18, height: 18, lineHeight: "16px", padding: 0, fontSize: 12, borderRadius: 9, cursor: "pointer" },
          }, "×")))
      }

      const prevPos = "calc(50% + " + ((s.x || 0) * scale) + "px) calc(50% + " + ((s.y || 0) * scale) + "px)"
      const preview = name
        ? React.createElement("div", {
            onMouseDown: (e) => { e.preventDefault(); setDrag({ startX: e.clientX, startY: e.clientY, x0: s.x || 0, y0: s.y || 0 }) },
            onMouseMove: (e) => { if (drag) doUpdate({ x: drag.x0 + (e.clientX - drag.startX) / scale, y: drag.y0 + (e.clientY - drag.startY) / scale }) },
            onMouseUp: () => setDrag(null),
            onMouseLeave: () => setDrag(null),
            style: { position: "relative", width: prevW, height: prevH, margin: "0 auto", borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2)", overflow: "hidden", cursor: drag ? "grabbing" : "grab" },
          },
            // 背景层：只覆盖聊天列区域（与真实页面一致），盒子与聊天列同宽高比，构图逐像素一致
            React.createElement("div", {
              style: {
                position: "absolute", top: 0, bottom: 0, left: colLeft, right: colRight,
                backgroundImage: "url(\"/dsh-skin/" + name + "?d=" + encodeURIComponent(dir) + "\")",
                backgroundSize: bgSize(s),
                backgroundPosition: prevPos,
                backgroundRepeat: "no-repeat",
              },
            }),
            // 迷你侧栏：展开=实测宽度；收起=56px 窄 rail + icon 圆点
            React.createElement("div", {
              style: {
                position: "absolute", top: 0, bottom: 0, left: 0, width: sideEff,
                background: "var(--dsw-specific-sidebar-fill)",
                opacity: 0.92,
                borderRight: "1px solid var(--dsw-alias-border-l1)",
              },
            },
              layout && layout.collapsed
                ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 14 } },
                    React.createElement("div", { style: { width: 8, height: 8, borderRadius: 4, background: "var(--dsw-alias-interactive-bg-hover-solid)", opacity: 0.9 } }),
                    React.createElement("div", { style: { width: 8, height: 8, borderRadius: 4, background: "var(--dsw-alias-interactive-bg-hover-solid)", opacity: 0.7 } }),
                    React.createElement("div", { style: { width: 8, height: 8, borderRadius: 4, background: "var(--dsw-alias-interactive-bg-hover-solid)", opacity: 0.5 } }))
                : React.createElement("div", null,
                    React.createElement("div", { style: { margin: "10px 0 0 10px", width: 20, height: 8, borderRadius: 4, background: "var(--dsw-alias-interactive-bg-hover-solid)", opacity: 0.9 } }),
                    React.createElement("div", { style: { margin: "6px 0 0 10px", width: 14, height: 8, borderRadius: 4, background: "var(--dsw-alias-interactive-bg-hover-solid)", opacity: 0.7 } })),
            ),
            // 迷你详情列：打开时按实测宽度显示
            detW > 1
              ? React.createElement("div", {
                  style: {
                    position: "absolute", top: 0, bottom: 0, right: 0, width: detW,
                    background: "var(--dsw-alias-bg-base)",
                    opacity: 0.9,
                    borderLeft: "1px solid var(--dsw-alias-border-l2)",
                  },
                })
              : null,
            // 迷你对话列：标题条 + 气泡 + 底部输入条（在聊天列区域内）
            React.createElement("div", {
              style: { position: "absolute", top: 0, left: colLeft, right: colRight, height: 26, background: "var(--dsw-alias-bg-base)", opacity: 0.85, borderBottom: "1px solid var(--dsw-alias-border-l1)" },
            }),
            React.createElement("div", {
              style: { position: "absolute", top: 34, left: colLeft + 8, right: (colRight || 0) + 8, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", pointerEvents: "none" },
            },
              React.createElement("div", { style: { background: "var(--anime-bubble-assistant, rgba(20,22,28,0.75))", borderRadius: 8, padding: "4px 8px", fontSize: 10, opacity: 0.9 } }, "对话内容"),
              React.createElement("div", { style: { alignSelf: "flex-end", background: "var(--dsw-specific-bubble)", borderRadius: 8, padding: "4px 8px", fontSize: 10, opacity: 0.9 } }, "你的消息")),
            React.createElement("div", {
              style: { position: "absolute", left: colLeft + 8, right: (colRight || 0) + 8, bottom: 8, height: 20, borderRadius: 10, background: "var(--dsw-specific-input-major)", opacity: 0.85, border: "1px solid var(--dsw-alias-border-l1)" },
            }),
          )
        : React.createElement("div", { style: { height: 240, borderRadius: 10, border: "1px dashed var(--dsw-alias-border-l2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-secondary)" } }, "未选择背景")

      const opts = [React.createElement("option", { key: "_none", value: "" }, "（不显示背景）")]
      for (const im of images) {
        opts.push(React.createElement("option", { key: im.name, value: im.name }, im.width && im.height ? im.name + " (" + im.width + "×" + im.height + ")" : im.name))
      }

      const modeBtns = [["none", "不干预"], ["auto", "自动识别"], ["warm", "焦糖暖"], ["cool", "青蓝冷"], ["sakura", "樱粉"], ["night", "极夜"], ["custom", "自定义"]]

      return React.createElement("div", {
        ref: (el) => { if (el && el.clientWidth !== contW) setContW(el.clientWidth) },
        style: { display: "flex", flexDirection: "column", gap: 10 },
      },
        React.createElement("div", null,
          React.createElement("label", { style: { fontWeight: 600 } }, "背景设置"),
          React.createElement("div", { style: { marginTop: 4, fontSize: 12, opacity: 0.7, wordBreak: "break-all" } }, dir ? "文件夹：" + dir : ""),
          React.createElement("div", { style: { marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" } },
            React.createElement("button", {
              onClick: async () => {
                if (!workspacesRef || busy) return
                setBusy(true); setError(null)
                try {
                  const p = await workspacesRef.pickDirectory()
                  if (p) {
                    const r = await api.setDir(p)
                    if (r && r.ok === true) {
                      stopSlide(); setIsPlaying(false)
                      current = { name: "", dir: p }
                      await loadList()
                      sync()
                      saveState()
                    } else {
                      setError((r && r.error) || "无法使用该文件夹")
                    }
                  }
                } catch (err) { setError(String((err && err.message) || err)) } finally { setBusy(false) }
              },
            }, busy ? "选择中…" : "选择文件夹…"),
            React.createElement("button", { onClick: doToggleFav, disabled: !name },
              favorites.some((f) => f.name === name) ? "★ 已收藏（点击取消）" : "☆ 收藏当前"),
            React.createElement("button", { onClick: () => doSelect("") }, "清除背景"))),

        React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("button", { onClick: () => doStep(-1), disabled: images.length === 0 }, "◀"),
          React.createElement("button", { onClick: () => doStep(1), disabled: images.length === 0 }, "▶"),
          React.createElement("span", { style: { fontSize: 12, opacity: 0.7 } }, idx >= 0 ? (idx + 1) + " / " + images.length : "—"),
          React.createElement("select", { value: name, onChange: (e) => doSelect(e.target.value), style: { flex: 1, minWidth: 0 } }, opts)),
        preview,

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12 } }, "适配："),
            React.createElement("button", { onClick: () => doUpdate({ fit: "cover" }) }, "铺满"),
            React.createElement("button", { onClick: () => doUpdate({ fit: "contain" }) }, "完整"),
            React.createElement("button", { onClick: () => doUpdate({ fit: "custom" }) }, "自定义"),
            React.createElement("button", { onClick: doReset }, "重置")),
          React.createElement("label", { style: { fontSize: 12 } }, "缩放 " + (s.fit === "custom" ? (s.zoom || 100) + "%" : "—"),
            React.createElement("input", { type: "range", min: 100, max: 300, step: 5, value: s.zoom || 100, disabled: s.fit !== "custom", onChange: (e) => doUpdate({ zoom: Number(e.target.value) }), style: { width: "100%" } })),
          React.createElement("label", { style: { fontSize: 12 } }, "水平偏移 " + (s.x || 0) + "px",
            React.createElement("input", { type: "range", min: -1500, max: 1500, step: 10, value: s.x || 0, onChange: (e) => doUpdate({ x: Number(e.target.value) }), style: { width: "100%" } })),
          React.createElement("label", { style: { fontSize: 12 } }, "垂直偏移 " + (s.y || 0) + "px",
            React.createElement("input", { type: "range", min: -1000, max: 1000, step: 10, value: s.y || 0, onChange: (e) => doUpdate({ y: Number(e.target.value) }), style: { width: "100%" } })),
          React.createElement("div", { style: { fontSize: 12, opacity: 0.7 } }, "提示：拖动预览可直接平移；缩放需先选\"自定义\"模式；收藏会保存当前调节结果")),

        React.createElement("div", { style: { display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 } }, film),

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
          React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, "收藏夹 (" + favorites.length + ")"),
            React.createElement("button", { onClick: doTogglePlay, disabled: favorites.length === 0 },
              isPlaying ? "⏸ 暂停播放" : "▶ 播放"),
            React.createElement("button", { onClick: doClearFavs, disabled: favorites.length === 0 }, "清空收藏")),
          favorites.length === 0
            ? React.createElement("div", { style: { fontSize: 12, opacity: 0.6 } }, "浏览时点\"☆ 收藏当前\"收藏喜欢的图（保存调节后的版本），之后可点击收藏夹内任意一张直接应用，或播放全部")
            : React.createElement("div", { style: { display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 } }, favStrip)),

        React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("span", { style: { fontSize: 12 } }, "播放间隔："),
          React.createElement("select", {
            value: String(intervalMs),
            onChange: (e) => doSetInterval(e.target.value),
          }, [["3000", "3 秒"], ["5000", "5 秒"], ["10000", "10 秒"], ["30000", "30 秒"], ["60000", "1 分钟"], ["120000", "2 分钟"], ["300000", "5 分钟"], ["600000", "10 分钟"], ["1800000", "30 分钟"], ["3600000", "1 小时"]].map((iv) => React.createElement("option", { key: iv[0], value: iv[0] }, iv[1])))),

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--dsw-alias-border-l1)", paddingTop: 8 } },
          React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, "主题："),
            modeBtns.map((mb) => React.createElement("button", {
              key: mb[0],
              onClick: () => doSetThemeMode(mb[0]),
              style: mb[0] === tMode ? { border: "1px solid var(--dsw-alias-brand-primary)" } : {},
            }, mb[1]))),
          tMode === "custom"
            ? React.createElement("label", { style: { fontSize: 12 } }, "主色：",
                React.createElement("input", { type: "color", value: tColor, onChange: (e) => doSetCustomColor(e.target.value), style: { verticalAlign: "middle", marginLeft: 8, width: 48, height: 26, border: "none", padding: 0, background: "transparent" } }))
            : null,
          React.createElement("label", { style: { fontSize: 12 } }, "着色强度 " + tInt + "%",
            React.createElement("input", { type: "range", min: 0, max: 100, value: tInt, onChange: (e) => doSetIntensity(e.target.value), style: { width: "100%" } })),
          React.createElement("label", { style: { fontSize: 12 } }, "纱幕浓度（背景透出度）" + tTrans + "%",
            React.createElement("input", { type: "range", min: 0, max: 100, value: tTrans, onChange: (e) => doSetTransparency(e.target.value), style: { width: "100%" } })),
          React.createElement("label", { style: { fontSize: 12 } }, "输入框透出度（颜色跟随主题）" + tInput + "%",
            React.createElement("input", { type: "range", min: 0, max: 100, value: tInput, onChange: (e) => doSetInputAlpha(e.target.value), style: { width: "100%" } })),
          React.createElement("label", { style: { fontSize: 12 } }, "气泡透出度（对话气泡）" + tBubble + "%",
            React.createElement("input", { type: "range", min: 0, max: 100, value: tBubble, onChange: (e) => doSetBubbleAlpha(e.target.value), style: { width: "100%" } })),
          React.createElement("div", { style: { fontSize: 12, opacity: 0.7 } }, "\"自动识别\"从背景图提取主色调；\"自定义\"用取色器选主色（如红色）；强度越高界面颜色越明显；助手与自己的消息都有对比色气泡保证可读")),

        themeMode === "auto" && name
          ? React.createElement("div", { style: { display: "none" } },
              React.createElement("canvas", { ref: (el) => { els.cv = el }, width: 8, height: 8 }),
              React.createElement("img", { ref: (el) => { els.img = el }, src: "/dsh-skin/" + name + "?d=" + encodeURIComponent(dir), onLoad: onDetectLoad }))
          : null,

        error ? React.createElement("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 } }, error) : null)
    }

    // ── 插件入口 ──
    function apply(ctx) {
      themeRef = ctx.get("theme")
      workspacesRef = ctx.get("workspaces")
      timerRef = ctx.get("timer")
      // 受限 context 禁止未 inject 的属性访问（会直接抛错），只能通过 ctx.get 取服务；
      // timer 是 Cordis context mixin 而非注册服务，ctx.get 拿不到时退回原生定时器
      // （常规插件有完整 DOM 权限，window 一定可用）
      if (timerRef == null) {
        // 常规插件有完整 DOM 权限，原生定时器兜底
        timerRef = {
          interval: (fn, ms) => { const id = window.setInterval(fn, ms); return () => window.clearInterval(id) },
          timeout: (fn, ms) => { const id = window.setTimeout(fn, ms); return () => window.clearTimeout(id) },
          debounce: (fn, ms) => {
            let t = null
            const out = (...a) => { if (t) window.clearTimeout(t); t = window.setTimeout(() => { t = null; fn(...a) }, ms) }
            out.dispose = () => { if (t) { window.clearTimeout(t); t = null } }
            return out
          },
        }
      }
      const disposes = []
      disposes.push(insertCss(`
        html { background-color: #0a0c10 !important; }
        .Sxvs8a_root {
          background: var(--anime-bubble-assistant, rgba(20, 22, 28, 0.75));
          border-radius: 18px;
          padding: 10px 16px;
        }
        /* 工具调用：无气泡，纯文字 + 阴影高对比 */
        .o3BgMG_title {
          font-weight: 500;
        }
        .o3BgMG_summary, .o3BgMG_summarySuffix, .o3BgMG_fileLink {
          color: var(--dsw-alias-label-primary) !important;
        }
        .o3BgMG_title, .o3BgMG_summary, .o3BgMG_summarySuffix, .o3BgMG_fileLink, .o3BgMG_errorSummary {
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.65), 0 0 6px rgba(255, 255, 255, 0.35);
        }
        html:root body[data-ds-dark-theme] .o3BgMG_title,
        html:root body[data-ds-dark-theme] .o3BgMG_summary,
        html:root body[data-ds-dark-theme] .o3BgMG_summarySuffix,
        html:root body[data-ds-dark-theme] .o3BgMG_fileLink,
        html:root body[data-ds-dark-theme] .o3BgMG_errorSummary {
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65), 0 0 6px rgba(0, 0, 0, 0.4);
        }
        /* 统计条：无气泡，仅高对比文字 */
        .FJxK0a_root {
          color: var(--dsw-alias-label-primary) !important;
        }
        .FJxK0a_sep {
          color: var(--dsw-alias-label-secondary) !important;
        }
        /* 上下文/压缩行：无气泡，仅高对比文字 */
        .gdEzaW_contextRow, .gdEzaW_compactionRow {
          color: var(--dsw-alias-label-secondary) !important;
        }
        .gdEzaW_compactionTitle {
          color: var(--dsw-alias-label-primary) !important;
        }
        .gdEzaW_compactionSummary {
          color: var(--dsw-alias-label-secondary) !important;
        }
        /* 消息操作条：无气泡，按钮为裸图标，时钟文字高对比 + 阴影 */
        .p-xYUq_timeStart, .p-xYUq_timeEnd {
          color: var(--dsw-alias-label-primary) !important;
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.65), 0 0 6px rgba(255, 255, 255, 0.35);
        }
        html:root body[data-ds-dark-theme] .p-xYUq_timeStart,
        html:root body[data-ds-dark-theme] .p-xYUq_timeEnd {
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65), 0 0 6px rgba(0, 0, 0, 0.4);
        }
        /* 操作图标：提亮 + 投影（hover 反馈保留） */
        .p-xYUq_action, ._8_XoUG_action {
          color: var(--dsw-alias-label-primary);
          filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.6));
        }
        html:root body[data-ds-dark-theme] .p-xYUq_action,
        html:root body[data-ds-dark-theme] ._8_XoUG_action {
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
        }
        /* 产物条：去 chip，高对比文字 + 阴影 */
        .P4kPIW_file {
          background: transparent !important;
          color: var(--dsw-alias-label-primary) !important;
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.65), 0 0 6px rgba(255, 255, 255, 0.35);
        }
        .P4kPIW_label, .P4kPIW_more, .P4kPIW_showFolder {
          color: var(--dsw-alias-label-secondary) !important;
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.65), 0 0 6px rgba(255, 255, 255, 0.35);
        }
        html:root body[data-ds-dark-theme] .P4kPIW_file,
        html:root body[data-ds-dark-theme] .P4kPIW_label,
        html:root body[data-ds-dark-theme] .P4kPIW_more,
        html:root body[data-ds-dark-theme] .P4kPIW_showFolder {
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65), 0 0 6px rgba(0, 0, 0, 0.4);
        }
      `))
      restore()
      const slots = ctx.get("slots")
      if (slots === undefined) return
      disposes.push(slots.inject("settings.section", () => slots.register(
        { name: "settings.section", id: "dsh-skin", order: 30, label: "皮肤 (◕‿◕)" },
        () => React.createElement(BackgroundPicker),
      )))
      disposes.push(stopSlide)
      return () => { for (const fn of disposes) { try { fn() } catch (_) { /* ignore */ } } }
    }
    const inject = ["slots"];

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
