import { useEffect, useRef, useState } from "react"
import { MessageCircle } from "lucide-react"

// ── Idle (4 frames) ────────────────────────────────────────────────────────
import idle01 from "../../../../src/components/ai-assistant/assets/idle-01.png"
import idle03 from "../../../../src/components/ai-assistant/assets/idle-03.png"
import idle05 from "../../../../src/components/ai-assistant/assets/idle-05.png"
import idle07 from "../../../../src/components/ai-assistant/assets/idle-07.png"

// ── Blink (9 frames: named set + sprite-sheet set) ─────────────────────────
import blink01 from "../../../../src/components/ai-assistant/assets/blink-01.png"
import blink02 from "../../../../src/components/ai-assistant/assets/blink-02.png"
import blink03 from "../../../../src/components/ai-assistant/assets/blink-03.png"
import blink04 from "../../../../src/components/ai-assistant/assets/blink-04.png"
import blink05 from "../../../../src/components/ai-assistant/assets/blink-05.png"
import blink06 from "../../../../src/components/ai-assistant/assets/blink-06.png"
import blinkF01 from "../../../../src/components/ai-assistant/assets/02_blinking_frame01.png"
import blinkF05 from "../../../../src/components/ai-assistant/assets/02_blinking_frame05.png"
import blinkF06 from "../../../../src/components/ai-assistant/assets/02_blinking_frame06.png"

// ── Happy (12 frames: named set + sprite-sheet set) ────────────────────────
import happy01 from "../../../../src/components/ai-assistant/assets/happy-01.png"
import happy03 from "../../../../src/components/ai-assistant/assets/happy-03.png"
import happy05 from "../../../../src/components/ai-assistant/assets/happy-05.png"
import happy07 from "../../../../src/components/ai-assistant/assets/happy-07.png"
import happyF01 from "../../../../src/components/ai-assistant/assets/04_happy_frame01.png"
import happyF02 from "../../../../src/components/ai-assistant/assets/04_happy_frame02.png"
import happyF03 from "../../../../src/components/ai-assistant/assets/04_happy_frame03.png"
import happyF04 from "../../../../src/components/ai-assistant/assets/04_happy_frame04.png"
import happyF05 from "../../../../src/components/ai-assistant/assets/04_happy_frame05.png"
import happyF06 from "../../../../src/components/ai-assistant/assets/04_happy_frame06.png"
import happyF07 from "../../../../src/components/ai-assistant/assets/04_happy_frame07.png"
import happyF08 from "../../../../src/components/ai-assistant/assets/04_happy_frame08.png"

// ── Thinking (5 frames) ───────────────────────────────────────────────────
import thinking01 from "../../../../src/components/ai-assistant/assets/thinking-01.png"
import thinking02 from "../../../../src/components/ai-assistant/assets/thinking-02.png"
import thinking03 from "../../../../src/components/ai-assistant/assets/thinking-03.png"
import thinking06 from "../../../../src/components/ai-assistant/assets/thinking-06.png"
import thinking07 from "../../../../src/components/ai-assistant/assets/thinking-07.png"

// ── Working (12 frames: named set + sprite-sheet set) ─────────────────────
import working02 from "../../../../src/components/ai-assistant/assets/working-02.png"
import working04 from "../../../../src/components/ai-assistant/assets/working-04.png"
import working05 from "../../../../src/components/ai-assistant/assets/working-05.png"
import working06 from "../../../../src/components/ai-assistant/assets/working-06.png"
import workingF01 from "../../../../src/components/ai-assistant/assets/06_working_frame01.png"
import workingF02 from "../../../../src/components/ai-assistant/assets/06_working_frame02.png"
import workingF03 from "../../../../src/components/ai-assistant/assets/06_working_frame03.png"
import workingF04 from "../../../../src/components/ai-assistant/assets/06_working_frame04.png"
import workingF05 from "../../../../src/components/ai-assistant/assets/06_working_frame05.png"
import workingF06 from "../../../../src/components/ai-assistant/assets/06_working_frame06.png"
import workingF07 from "../../../../src/components/ai-assistant/assets/06_working_frame07.png"
import workingF08 from "../../../../src/components/ai-assistant/assets/06_working_frame08.png"

// ── Dragging (9 frames: named set + sprite-sheet set) ─────────────────────
import dragging01 from "../../../../src/components/ai-assistant/assets/dragging-01.png"
import dragging03 from "../../../../src/components/ai-assistant/assets/dragging-03.png"
import dragging05 from "../../../../src/components/ai-assistant/assets/dragging-05.png"
import draggingF01 from "../../../../src/components/ai-assistant/assets/07_dragging_frame01.png"
import draggingF02 from "../../../../src/components/ai-assistant/assets/07_dragging_frame02.png"
import draggingF03 from "../../../../src/components/ai-assistant/assets/07_dragging_frame03.png"
import draggingF04 from "../../../../src/components/ai-assistant/assets/07_dragging_frame04.png"
import draggingF05 from "../../../../src/components/ai-assistant/assets/07_dragging_frame05.png"
import draggingF06 from "../../../../src/components/ai-assistant/assets/07_dragging_frame06.png"

// ── Click / Tap (8 frames: named set + sprite-sheet set) ──────────────────
import click01 from "../../../../src/components/ai-assistant/assets/click-01.png"
import click02 from "../../../../src/components/ai-assistant/assets/click-02.png"
import click03 from "../../../../src/components/ai-assistant/assets/click-03.png"
import click04 from "../../../../src/components/ai-assistant/assets/click-04.png"
import clickF01 from "../../../../src/components/ai-assistant/assets/08_click_tap_frame01.png"
import clickF02 from "../../../../src/components/ai-assistant/assets/08_click_tap_frame02.png"
import clickF03 from "../../../../src/components/ai-assistant/assets/08_click_tap_frame03.png"
import clickF04 from "../../../../src/components/ai-assistant/assets/08_click_tap_frame04.png"

// ── Success (10 frames: named set + sprite-sheet set) ─────────────────────
import success01 from "../../../../src/components/ai-assistant/assets/success-01.png"
import success03 from "../../../../src/components/ai-assistant/assets/success-03.png"
import success05 from "../../../../src/components/ai-assistant/assets/success-05.png"
import success06 from "../../../../src/components/ai-assistant/assets/success-06.png"
import successF01 from "../../../../src/components/ai-assistant/assets/09_success_frame01.png"
import successF02 from "../../../../src/components/ai-assistant/assets/09_success_frame02.png"
import successF03 from "../../../../src/components/ai-assistant/assets/09_success_frame03.png"
import successF04 from "../../../../src/components/ai-assistant/assets/09_success_frame04.png"
import successF05 from "../../../../src/components/ai-assistant/assets/09_success_frame05.png"
import successF06 from "../../../../src/components/ai-assistant/assets/09_success_frame06.png"

// ── Error / Confused (6 frames from 10_error sprite sheet) ────────────────
// Note: confused-*.png do not exist in assets; 10_error_frame* are used instead.
import errorF01 from "../../../../src/components/ai-assistant/assets/10_error_frame01.png"
import errorF02 from "../../../../src/components/ai-assistant/assets/10_error_frame02.png"
import errorF03 from "../../../../src/components/ai-assistant/assets/10_error_frame03.png"
import errorF04 from "../../../../src/components/ai-assistant/assets/10_error_frame04.png"
import errorF05 from "../../../../src/components/ai-assistant/assets/10_error_frame05.png"
import errorF06 from "../../../../src/components/ai-assistant/assets/10_error_frame06.png"

import "./AIMascot.css"

// ─────────────────────────────────────────────────────────────────────────────
// Animation sequences — all available frames used
// ─────────────────────────────────────────────────────────────────────────────
const SEQUENCES = {
  // 4-frame idle float
  idle: [idle01, idle03, idle05, idle07],

  // 9-frame blink: open → close → reopen using both asset sets
  blink: [blinkF01, blink01, blink02, blink03, blink04, blink05, blink06, blinkF05, blinkF06],

  // 12-frame happy: named frames extended by sprite-sheet frames
  happy: [happy01, happy03, happyF01, happyF02, happyF03, happyF04, happy05, happyF05, happyF06, happyF07, happyF08, happy07],

  // 5-frame thinking loop
  thinking: [thinking01, thinking02, thinking03, thinking06, thinking07],

  // 12-frame working loop: named frames + sprite-sheet frames interleaved
  working: [workingF01, workingF02, working02, workingF03, workingF04, working04, workingF05, working05, workingF06, working06, workingF07, workingF08],

  // 9-frame dragging loop: named + sprite-sheet
  dragging: [draggingF01, draggingF02, dragging01, draggingF03, draggingF04, dragging03, draggingF05, dragging05, draggingF06],

  // 8-frame click reaction: named + sprite-sheet
  click: [clickF01, click01, clickF02, click02, clickF03, click03, clickF04, click04],

  // 10-frame success: named + sprite-sheet
  success: [successF01, success01, successF02, successF03, success03, successF04, successF05, success05, successF06, success06],

  // 6-frame error / confused (10_error_frame set)
  error: [errorF01, errorF02, errorF03, errorF04, errorF05, errorF06],
}

// Frame durations (ms per frame) for each state
const FRAME_DELAY = {
  idle: 420,
  blink: 75,
  happy: 120,
  thinking: 360,
  working: 140,
  dragging: 110,
  click: 85,
  success: 120,
  error: 150,
}

// States that play once and stop (do not loop)
const ONE_SHOT_STATES = new Set(["click", "blink", "happy", "success", "error"])

// Cycle through all non-result animations so the mascot stays visibly lively.
// Click/drag and success/error remain tied to their real interactions/results.
const AMBIENT_POOL = ["blink", "happy", "thinking", "working"]

// How long each ambient reaction plays before returning to idle (ms)
const AMBIENT_REACTION_DURATION = {
  blink: 780,    // 9 frames × 75ms ≈ 675ms + buffer
  happy: 1560,   // 12 frames × 120ms = 1440ms + buffer
  thinking: 1800,
  working: 1680, // 12 frames × 140ms
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────
const POSITION_KEY = "syncliving.ai-mascot-position.v1"
const VISIBILITY_KEY = "syncliving.ai-mascot-visible.v1"
const CONTEXT_MENU_WIDTH = 148
const CONTEXT_MENU_HEIGHT = 42

function readSavedVisibility() {
  try { return window.localStorage.getItem(VISIBILITY_KEY) !== "false" } catch { return true }
}
function saveVisibility(visible) {
  try { window.localStorage.setItem(VISIBILITY_KEY, String(visible)) } catch { /* no-op */ }
}
function readSavedPosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null")
    return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? saved : null
  } catch { return null }
}
function savePosition(position) {
  try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(position)) } catch { /* no-op */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Position / viewport helpers
// ─────────────────────────────────────────────────────────────────────────────
function getMascotDimensions(buttonRef, mascotVisible) {
  if (!mascotVisible) {
    return {
      width: Math.min(100, Math.max(76, window.innerWidth * 0.08)),
      height: Math.min(116, Math.max(88, window.innerWidth * 0.09)),
    }
  }
  const rect = buttonRef.current?.getBoundingClientRect()
  return { width: rect?.width || 96, height: rect?.height || 112 }
}

function clampMascotPosition(candidate, buttonRef, mascotVisible = true) {
  const { width, height } = getMascotDimensions(buttonRef, mascotVisible)
  const maxX = Math.max(8, window.innerWidth - width - 8)
  const maxY = Math.max(8, window.innerHeight - height - 8)
  return {
    x: Math.min(Math.max(8, candidate.x), maxX),
    y: Math.min(Math.max(8, candidate.y), maxY),
  }
}

function getDefaultMascotPosition(buttonRef, mascotVisible = true) {
  const { width, height } = getMascotDimensions(buttonRef, mascotVisible)
  return clampMascotPosition(
    { x: window.innerWidth - width - 20, y: window.innerHeight - height - 28 },
    buttonRef,
    mascotVisible,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AIMascot({ state: externalState = "idle", onActivate }) {
  const buttonRef = useRef(null)
  const contextMenuRef = useRef(null)
  const menuItemRef = useRef(null)
  const pointerRef = useRef(null)
  const positionRef = useRef(null)
  const suppressClickRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const ambientTimerRef = useRef(null)
  const ambientIndexRef = useRef(0)

  const [position, setPosition] = useState(null)
  const [mascotVisible, setMascotVisible] = useState(readSavedVisibility)
  const [contextMenu, setContextMenu] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [ambientState, setAmbientState] = useState("idle")
  const [frameIndex, setFrameIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  // ── Derived state ──────────────────────────────────────────────────────────
  // wink-left / wink-right: no dedicated assets — use blink-03 as face overlay
  // on top of an idle body. This preserves the wink overlay CSS structure.
  const isWinking = externalState === "wink-left" || externalState === "wink-right"
  const winkFaceFrame = isWinking ? blink03 : null

  // Priority: dragging → external AI state → ambient random
  const activeBodyState = isDragging
    ? "dragging"
    : isWinking
      ? "idle"  // idle body + wink face overlay
      : (externalState !== "idle" && SEQUENCES[externalState])
        ? externalState
        : (SEQUENCES[ambientState] ? ambientState : "idle")

  const frames = SEQUENCES[activeBodyState] || SEQUENCES.idle
  const shouldAnimate = mascotVisible && !reducedMotion && isVisible

  // ── Viewport / position init ───────────────────────────────────────────────
  const moveTo = (candidate, persist = false) => {
    const next = clampMascotPosition(candidate, buttonRef, mascotVisible)
    positionRef.current = next
    setPosition(next)
    if (persist) savePosition(next)
  }

  useEffect(() => {
    const stored = readSavedPosition()
    const start = stored || getDefaultMascotPosition(buttonRef, mascotVisible)
    positionRef.current = clampMascotPosition(start, buttonRef, mascotVisible)
    setPosition(positionRef.current)

    const syncViewport = () => {
      const next = clampMascotPosition(
        positionRef.current || getDefaultMascotPosition(buttonRef, mascotVisible),
        buttonRef,
        mascotVisible,
      )
      positionRef.current = next
      setPosition(next)
      savePosition(next)
    }
    window.addEventListener("resize", syncViewport)
    window.addEventListener("orientationchange", syncViewport)
    return () => {
      window.removeEventListener("resize", syncViewport)
      window.removeEventListener("orientationchange", syncViewport)
    }
  }, [mascotVisible])

  // ── Reduced-motion + tab visibility ───────────────────────────────────────
  useEffect(() => {
    const motionPref = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncMotion = () => setReducedMotion(motionPref.matches)
    const syncVisibility = () => setIsVisible(document.visibilityState === "visible")
    syncMotion()
    syncVisibility()
    motionPref.addEventListener?.("change", syncMotion)
    document.addEventListener("visibilitychange", syncVisibility)
    return () => {
      motionPref.removeEventListener?.("change", syncMotion)
      document.removeEventListener("visibilitychange", syncVisibility)
    }
  }, [])

  // ── Clean up suppress timer on unmount ────────────────────────────────────
  useEffect(() => () => {
    window.clearTimeout(suppressTimerRef.current)
    window.clearTimeout(ambientTimerRef.current)
  }, [])

  // ── Frame cycling ─────────────────────────────────────────────────────────
  // Reset to frame 0 on every state change, then advance at the correct speed.
  useEffect(() => {
    setFrameIndex(0)
    if (!shouldAnimate || frames.length < 2) return undefined

    const delay = FRAME_DELAY[activeBodyState] || 200
    const isOneShot = ONE_SHOT_STATES.has(activeBodyState)
    let idx = 0

    const interval = window.setInterval(() => {
      idx = (idx + 1) % frames.length
      setFrameIndex(idx)
      if (isOneShot && idx >= frames.length - 1) {
        window.clearInterval(interval)
      }
    }, delay)

    return () => window.clearInterval(interval)
  }, [activeBodyState, shouldAnimate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ambient random animation scheduler ────────────────────────────────────
  // Runs ONLY when: tab visible + motion OK + no AI request + not dragging.
  // Priority is enforced by the activeBodyState derivation above.
  useEffect(() => {
    window.clearTimeout(ambientTimerRef.current)

    const canRunAmbient = shouldAnimate && externalState === "idle" && !isDragging
    if (!canRunAmbient) {
      setAmbientState("idle")
      return undefined
    }

    let cancelled = false

    const scheduleReaction = () => {
      // Wait a random idle period before the next reaction (5 – 6 s)
      const idleWait = 5000 + Math.random() * 1000
      ambientTimerRef.current = window.setTimeout(() => {
        if (cancelled) return
        const reaction = AMBIENT_POOL[ambientIndexRef.current % AMBIENT_POOL.length]
        ambientIndexRef.current += 1
        setAmbientState(reaction)
        // After the reaction plays, return to idle and schedule the next one
        const reactionDuration = AMBIENT_REACTION_DURATION[reaction] || 1000
        ambientTimerRef.current = window.setTimeout(() => {
          if (cancelled) return
          setAmbientState("idle")
          scheduleReaction()
        }, reactionDuration)
      }, idleWait)
    }

    scheduleReaction()

    return () => {
      cancelled = true
      window.clearTimeout(ambientTimerRef.current)
      setAmbientState("idle")
    }
  }, [shouldAnimate, externalState, isDragging])

  // ── Context-menu keyboard / outside-click handling ────────────────────────
  useEffect(() => {
    if (!contextMenu) return undefined
    menuItemRef.current?.focus()
    const closeOnOutsidePointer = (event) => {
      if (!contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenu])

  // Listen at window level as a fallback for browsers that lose pointer events
  // when the captured mascot moves or a touch pointer leaves its original hitbox.
  useEffect(() => {
    const movePointer = (event) => {
      const pointer = pointerRef.current
      if (!pointer || pointer.pointerId !== event.pointerId) return
      const deltaX = event.clientX - pointer.startX
      const deltaY = event.clientY - pointer.startY
      if (!pointer.moved && Math.hypot(deltaX, deltaY) < 6) return
      pointer.moved = true
      event.preventDefault()
      setIsDragging(true)
      const next = clampMascotPosition(
        { x: pointer.startPosition.x + deltaX, y: pointer.startPosition.y + deltaY },
        buttonRef,
        mascotVisible,
      )
      positionRef.current = next
      setPosition(next)
    }

    const endPointer = (event) => {
      const pointer = pointerRef.current
      if (!pointer || pointer.pointerId !== event.pointerId) return
      pointerRef.current = null
      if (pointer.moved) {
        suppressClickRef.current = true
        window.clearTimeout(suppressTimerRef.current)
        suppressTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false
        }, 500)
        if (positionRef.current) savePosition(positionRef.current)
      }
      setIsDragging(false)
      setAmbientState("idle")
    }

    window.addEventListener("pointermove", movePointer, { capture: true, passive: false })
    window.addEventListener("pointerup", endPointer, true)
    window.addEventListener("pointercancel", endPointer, true)
    return () => {
      window.removeEventListener("pointermove", movePointer, true)
      window.removeEventListener("pointerup", endPointer, true)
      window.removeEventListener("pointercancel", endPointer, true)
    }
  }, [mascotVisible])

  // ── Pointer / drag handlers ────────────────────────────────────────────────
  const startPointer = (event) => {
    if (!mascotVisible) return
    if (!event.isPrimary || event.button !== 0) return
    const start = positionRef.current || getDefaultMascotPosition(buttonRef, mascotVisible)
    positionRef.current = start
    setPosition(start)
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: start,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Window-level pointer listeners continue the drag if capture is unsupported.
    }
  }

  const handleClick = (event) => {
    if (suppressClickRef.current && event.detail !== 0) {
      suppressClickRef.current = false
      window.clearTimeout(suppressTimerRef.current)
      return
    }
    suppressClickRef.current = false
    onActivate?.()
  }

  const handleKeyDown = (event) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      openContextMenu(event)
      return
    }
    if (!mascotVisible) return
    const offsets = { ArrowUp: [0, -20], ArrowDown: [0, 20], ArrowLeft: [-20, 0], ArrowRight: [20, 0] }
    const offset = offsets[event.key]
    if (!offset) return
    event.preventDefault()
    const current = positionRef.current || getDefaultMascotPosition(buttonRef, mascotVisible)
    moveTo({ x: current.x + offset[0], y: current.y + offset[1] }, true)
  }

  const openContextMenu = (event) => {
    const rect = buttonRef.current?.getBoundingClientRect()
    const keyboardOpened = event.type === "keydown"
    const requestedX = keyboardOpened ? (rect?.left || 8) : event.clientX
    const requestedY = keyboardOpened ? (rect?.bottom || 8) : event.clientY
    const maxX = Math.max(8, window.innerWidth - CONTEXT_MENU_WIDTH - 8)
    const maxY = Math.max(8, window.innerHeight - CONTEXT_MENU_HEIGHT - 8)
    setContextMenu({
      x: Math.min(Math.max(8, requestedX), maxX),
      y: Math.min(Math.max(8, requestedY), maxY),
    })
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    openContextMenu(event)
  }

  const toggleMascotVisibility = () => {
    const nextVisibility = !mascotVisible
    setMascotVisible(nextVisibility)
    saveVisibility(nextVisibility)
    setContextMenu(null)
    buttonRef.current?.focus()
  }

  const handleMenuKeyDown = (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault()
      menuItemRef.current?.focus()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)]

  const stateLabel = externalState === "thinking"
    ? "Thinking"
    : externalState === "working"
      ? "Working"
      : externalState === "success"
        ? "Finished successfully"
        : externalState === "error"
          ? "Needs attention"
          : "Ready"

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`ai-mascot${mascotVisible ? "" : " ai-mascot--hidden"}`}
        style={position ? {
          left: mascotVisible
            ? `${position.x}px`
            : `calc(${position.x}px + clamp(28px, calc(8vw - 48px), 52px))`,
          top: mascotVisible
            ? `${position.y}px`
            : `calc(${position.y}px + clamp(40px, calc(9vw - 48px), 68px))`,
        } : undefined}
        data-state={isDragging ? "dragging" : activeBodyState}
        onPointerDown={startPointer}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        aria-label={mascotVisible
          ? `Open SyncLiving AI assistant. ${stateLabel}. Use arrow keys to move the mascot.`
          : "Open SyncLiving AI assistant. Mascot hidden. Right-click for options."}
        aria-haspopup="menu"
        aria-expanded={Boolean(contextMenu)}
        title={mascotVisible
          ? "Ask SyncLiving AI · Drag to move · Right-click to hide"
          : "Ask SyncLiving AI · Right-click to show mascot"}
      >
        {mascotVisible ? (
          <span className="ai-mascot__art" aria-hidden="true">
            <img className="ai-mascot__body" src={currentFrame} alt="" draggable="false" />
            {/* Wink overlay: idle body + blink-03 face approximates a wink */}
            {isWinking && (
              <span className="ai-mascot__wink-overlay">
                <span className="ai-mascot__screen" />
                <img className="ai-mascot__eyes" src={winkFaceFrame} alt="" draggable="false" />
              </span>
            )}
          </span>
        ) : (
          <MessageCircle className="ai-mascot__chat-icon" aria-hidden="true" />
        )}
      </button>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Mascot options"
          className="ai-mascot__context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            ref={menuItemRef}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="ai-mascot__context-menu-item"
            onClick={toggleMascotVisibility}
            onBlur={(event) => {
              if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setContextMenu(null)
            }}
          >
            {mascotVisible ? "Hide mascot" : "Show mascot"}
          </button>
        </div>
      )}
    </>
  )
}
