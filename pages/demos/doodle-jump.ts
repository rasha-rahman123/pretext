import { prepare, layout } from '../../src/layout.ts'

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const W = 360
const H = 600
canvas.width = W
canvas.height = H

// ── Constants ─────────────────────────────────────────────────────────────────
const GRAVITY = 0.35
const JUMP_VELOCITY = -11.5
const PLAYER_W = 40
const PLAYER_H = 40
const PLATFORM_W = 70
const PLATFORM_H = 14
const PLATFORM_COUNT = 10
const MOVE_SPEED = 4

// ── Pretext font strings ───────────────────────────────────────────────────────
const UI_FONT = 'bold 18px "Helvetica Neue", Helvetica, Arial, sans-serif'
const TITLE_FONT = 'bold 36px "Helvetica Neue", Helvetica, Arial, sans-serif'
const SMALL_FONT = '14px "Helvetica Neue", Helvetica, Arial, sans-serif'

// ── Types ─────────────────────────────────────────────────────────────────────
type Platform = {
  x: number
  y: number
  moving: boolean
  dir: number // 1 = right, -1 = left
}

type GameState = 'start' | 'playing' | 'dead'

// ── Game state ────────────────────────────────────────────────────────────────
let state: GameState = 'start'
let score = 0
let bestScore = 0
let cameraY = 0 // world Y of the top of the screen

let playerX = W / 2 - PLAYER_W / 2
let playerY = H - 120
let velX = 0
let velY = 0

let platforms: Platform[] = []

const keys: Record<string, boolean> = {}

// ── Pretext prepared handles (re-created each frame for dynamic values) ────────
// We prepare static strings once and reuse them; dynamic ones are prepared per render.

// ── Input ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.key] = true
  if ((e.key === ' ' || e.key === 'Enter') && state === 'start') startGame()
  if ((e.key === ' ' || e.key === 'Enter') && state === 'dead') startGame()
})
document.addEventListener('keyup', e => { keys[e.key] = false })

// Touch / swipe for mobile
let touchStartX = 0
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0]!.clientX
  if (state !== 'playing') startGame()
  e.preventDefault()
}, { passive: false })
canvas.addEventListener('touchmove', e => {
  const dx = e.touches[0]!.clientX - touchStartX
  playerX += dx * 0.4
  touchStartX = e.touches[0]!.clientX
  e.preventDefault()
}, { passive: false })

// ── Platform helpers ──────────────────────────────────────────────────────────
function makePlatform(y: number): Platform {
  const moving = Math.random() < 0.25 && Math.abs(cameraY) > H * 2
  return {
    x: Math.random() * (W - PLATFORM_W),
    y,
    moving,
    dir: Math.random() < 0.5 ? 1 : -1,
  }
}

function initPlatforms(): void {
  platforms = []
  // Starting platform directly under player
  platforms.push({ x: W / 2 - PLATFORM_W / 2, y: H - 80, moving: false, dir: 1 })
  // Rest evenly spaced upward
  for (let i = 1; i < PLATFORM_COUNT; i++) {
    platforms.push(makePlatform(H - 80 - i * (H / PLATFORM_COUNT)))
  }
}

// ── Game init / reset ─────────────────────────────────────────────────────────
function startGame(): void {
  state = 'playing'
  score = 0
  cameraY = 0
  playerX = W / 2 - PLAYER_W / 2
  playerY = H - 120
  velX = 0
  velY = JUMP_VELOCITY
  initPlatforms()
}

// ── Physics & update ──────────────────────────────────────────────────────────
function update(): void {
  if (state !== 'playing') return

  // Horizontal input
  velX = 0
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) velX = -MOVE_SPEED
  if (keys['ArrowRight'] || keys['d'] || keys['D']) velX = MOVE_SPEED

  playerX += velX
  // Wrap horizontally
  if (playerX + PLAYER_W < 0) playerX = W
  if (playerX > W) playerX = -PLAYER_W

  // Gravity
  velY += GRAVITY
  playerY += velY

  // Camera follows player upward
  const playerScreenY = playerY - cameraY
  if (playerScreenY < H * 0.4) {
    const delta = H * 0.4 - playerScreenY
    cameraY -= delta
    playerY -= delta // keep player screen-y stable while shifting camera
  }

  // Platform collision (only when falling)
  if (velY > 0) {
    for (const p of platforms) {
      const px = p.x
      const py = p.y - cameraY // screen Y of platform
      const playerScreenY2 = playerY - cameraY
      if (
        playerX + PLAYER_W > px &&
        playerX < px + PLATFORM_W &&
        playerScreenY2 + PLAYER_H >= py &&
        playerScreenY2 + PLAYER_H <= py + PLATFORM_H + velY + 2
      ) {
        velY = JUMP_VELOCITY
        // brief squash feedback (cosmetic only, handled in draw)
      }
    }
  }

  // Move moving platforms
  for (const p of platforms) {
    if (p.moving) {
      p.x += p.dir * 1.5
      if (p.x <= 0 || p.x + PLATFORM_W >= W) p.dir *= -1
    }
  }

  // Score = max upward travel (world units above start)
  const rawScore = Math.max(0, Math.floor(-cameraY / 10))
  score = rawScore
  if (score > bestScore) bestScore = score

  // Recycle platforms that scroll off screen bottom
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i]!
    if (p.y - cameraY > H + 20) {
      // Replace with one above the highest existing platform
      const minY = Math.min(...platforms.map(pp => pp.y))
      platforms[i] = makePlatform(minY - 40 - Math.random() * 20)
    }
  }

  // Fell off bottom — game over
  if (playerY - cameraY > H + 60) {
    state = 'dead'
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function drawRoundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawPlayer(sx: number, sy: number): void {
  // Body
  ctx.fillStyle = '#4caf50'
  drawRoundRect(sx, sy, PLAYER_W, PLAYER_H, 10)
  ctx.fill()

  // Eyes
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.ellipse(sx + 10, sy + 14, 6, 7, 0, 0, Math.PI * 2)
  ctx.ellipse(sx + 30, sy + 14, 6, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#1a1a2e'
  ctx.beginPath()
  ctx.ellipse(sx + 12, sy + 14, 3, 4, 0, 0, Math.PI * 2)
  ctx.ellipse(sx + 32, sy + 14, 3, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Mouth (smile)
  ctx.strokeStyle = '#1a1a2e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(sx + PLAYER_W / 2, sy + 26, 8, 0.1, Math.PI - 0.1)
  ctx.stroke()
}

function drawPlatform(p: Platform): void {
  const sx = p.x
  const sy = p.y - cameraY
  const color = p.moving ? '#ff9800' : '#43a047'
  ctx.fillStyle = color
  drawRoundRect(sx, sy, PLATFORM_W, PLATFORM_H, PLATFORM_H / 2)
  ctx.fill()
  // Highlight stripe
  ctx.fillStyle = p.moving ? '#ffcc80' : '#a5d6a7'
  drawRoundRect(sx + 6, sy + 3, PLATFORM_W - 12, 4, 2)
  ctx.fill()
}

// ── Pretext text rendering helper ─────────────────────────────────────────────
// Uses pretext prepare+layout to measure a single line's block height, then
// draws the text centered at `cy`. The explicit lineHeight passed to layout()
// is used consistently for both measurement and vertical centering.
function drawTextCentered(text: string, font: string, color: string, lineHeight: number, cy: number): void {
  const p = prepare(text, font)
  const measured = layout(p, W, lineHeight)
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, cy - measured.height / 2)
}

function drawTextLeft(text: string, font: string, color: string, x: number, y: number): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(text, x, y)
}

// ── Background gradient ───────────────────────────────────────────────────────
function drawBackground(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#0d1b2a')
  grad.addColorStop(0.5, '#1b2a4a')
  grad.addColorStop(1, '#1e3a5f')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Stars (stable seeded from camera)
  const seed = Math.floor(-cameraY / 300)
  for (let i = 0; i < 30; i++) {
    const sx = ((seed * 31 + i * 137) % W + W) % W
    const sy = ((seed * 17 + i * 79) % H + H) % H
    ctx.fillStyle = `rgba(255,255,255,${0.3 + (i % 3) * 0.2})`
    ctx.beginPath()
    ctx.arc(sx, sy, (i % 3 === 0) ? 1.5 : 1, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Score HUD ─────────────────────────────────────────────────────────────────
const UI_LINE_HEIGHT = 24 // matches UI_FONT size 18px * 1.33

function drawHUD(): void {
  const scoreText = `Score: ${score}`
  const bestText = `Best: ${bestScore}`

  // Use pretext to measure each label's block height for pill sizing.
  const scoreLineH = layout(prepare(scoreText, UI_FONT), W, UI_LINE_HEIGHT).height
  const pillH = Math.max(26, scoreLineH + 10)

  // Pill background
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  drawRoundRect(8, 8, 120, pillH, pillH / 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  drawRoundRect(W - 110, 8, 102, pillH, pillH / 2)
  ctx.fill()

  drawTextLeft(scoreText, UI_FONT, '#ffffff', 16, 8 + (pillH - scoreLineH) / 2)
  drawTextLeft(bestText, UI_FONT, '#ffd54f', W - 102, 8 + (pillH - scoreLineH) / 2)
}

// ── Start screen ───────────────────────────────────────────────────────────────
const TITLE_LINE_HEIGHT = 46 // matches TITLE_FONT size 36px * 1.27
const SMALL_LINE_HEIGHT = 20 // matches SMALL_FONT size 14px * 1.43
const SUB_LINE_HEIGHT = 20   // matches subFont size 14px

function drawStartScreen(): void {
  drawBackground()

  // Title
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  drawRoundRect(W / 2 - 140, H / 2 - 110, 280, 200, 20)
  ctx.fill()

  drawTextCentered('🐸 Doodle Jump', TITLE_FONT, '#4caf50', TITLE_LINE_HEIGHT, H / 2 - 60)

  const subFont = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif'
  const lines = [
    'Use ← → Arrow keys to move',
    'Land on platforms to jump',
    '',
    'Press Space or Enter to start',
  ]
  for (let i = 0; i < lines.length; i++) {
    drawTextCentered(
      lines[i]!,
      subFont,
      i === lines.length - 1 ? '#ffd54f' : '#b0bec5',
      SUB_LINE_HEIGHT,
      H / 2 + 20 + i * 22,
    )
  }
}

// ── Dead screen ────────────────────────────────────────────────────────────────
const SCORE_LINE_HEIGHT = 28  // matches scoreFont size 20px * 1.4
const BADGE_LINE_HEIGHT = 20  // matches smallFont2 size 14px

function drawDeadScreen(): void {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  drawRoundRect(W / 2 - 140, H / 2 - 110, 280, 190, 20)
  ctx.fill()

  drawTextCentered('Game Over', TITLE_FONT, '#ef5350', TITLE_LINE_HEIGHT, H / 2 - 60)

  const scoreFont = 'bold 20px "Helvetica Neue", Helvetica, Arial, sans-serif'
  const smallFont2 = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif'

  // Use pretext to measure the final score text block height for vertical placement.
  const finalScore = `Score: ${score}`
  const scoreBlockH = layout(prepare(finalScore, scoreFont), W, SCORE_LINE_HEIGHT).height
  const scoreY = H / 2 + 10 - scoreBlockH / 2

  drawTextCentered(finalScore, scoreFont, '#ffffff', SCORE_LINE_HEIGHT, scoreY)
  if (score === bestScore && score > 0) {
    drawTextCentered('🏆 New Best!', smallFont2, '#ffd54f', BADGE_LINE_HEIGHT, scoreY + scoreBlockH + 14)
  }
  drawTextCentered(
    'Space / Enter to play again',
    SMALL_FONT,
    '#90caf9',
    SMALL_LINE_HEIGHT,
    scoreY + scoreBlockH + (score === bestScore && score > 0 ? 40 : 20),
  )
}

// ── Main render ────────────────────────────────────────────────────────────────
function draw(): void {
  drawBackground()

  if (state === 'playing' || state === 'dead') {
    for (const p of platforms) drawPlatform(p)
    drawPlayer(playerX, playerY - cameraY)
    drawHUD()
  }

  if (state === 'start') drawStartScreen()
  if (state === 'dead') drawDeadScreen()
}

// ── Game loop ──────────────────────────────────────────────────────────────────
function loop(): void {
  update()
  draw()
  requestAnimationFrame(loop)
}

loop()
