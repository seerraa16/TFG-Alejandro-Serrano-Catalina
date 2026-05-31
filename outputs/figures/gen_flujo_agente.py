"""Genera fig_flujo_agente.png — TFG Alejandro Serrano."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

WHITE  = '#FFFFFF'
C_FRONT = '#1E3A5F'    # azul oscuro — frontend
C_API   = '#1A5C38'    # verde oscuro — FastAPI / pipeline
C_LLM   = '#553C7B'    # morado — LLM
C_LLM_L = '#7B50B0'    # morado claro — interior LLM
C_DEC   = '#B7791F'    # ámbar — decisión
C_DEC_F = '#FEFCE8'    # fondo rombo
C_ERR   = '#9B2C2C'    # rojo — error
C_PIPE  = '#A04010'    # naranja pipeline (interior)
C_PIPE_B= '#1A5C38'    # verde pipeline (borde/fondo)
C_ARROW = '#374151'
C_GRAY  = '#6B7280'

fig, ax = plt.subplots(figsize=(14, 8))
ax.set_xlim(0, 14)
ax.set_ylim(0, 8)
ax.axis('off')
fig.patch.set_facecolor(WHITE)
ax.set_facecolor(WHITE)

# ── helpers ────────────────────────────────────────────────────────────────
def rbox(x, y, w, h, fc, ec='none', lw=0, r=0.22, zorder=3, ls='-'):
    p = FancyBboxPatch((x, y), w, h,
                       boxstyle=f'round,pad=0,rounding_size={r}',
                       facecolor=fc, edgecolor=ec, linewidth=lw,
                       linestyle=ls, zorder=zorder)
    ax.add_patch(p)

def txt(x, y, s, size=9, color=WHITE, bold=False, ha='center', va='center',
        z=5, italic=False, mono=False):
    kw = dict(fontsize=size, color=color, ha=ha, va=va, zorder=z)
    if bold:   kw['fontweight'] = 'bold'
    if italic: kw['fontstyle'] = 'italic'
    if mono:   kw['fontfamily'] = 'monospace'
    ax.text(x, y, s, **kw)

def diamond(cx, cy, hw, hh, fc, ec, lw=1.5, zorder=3):
    xs = [cx, cx + hw, cx, cx - hw, cx]
    ys = [cy + hh, cy, cy - hh, cy, cy + hh]
    ax.fill(xs, ys, color=fc, zorder=zorder)
    ax.plot(xs, ys, color=ec, lw=lw, zorder=zorder + 1)

def arr(x0, y0, x1, y1, color=C_ARROW, lw=1.5, label='', r=0, ls='-'):
    style = f'arc3,rad={r}'
    ax.annotate('', xy=(x1, y1), xytext=(x0, y0),
                arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                                connectionstyle=style,
                                linestyle=ls), zorder=7)
    if label:
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        ax.text(mx + 0.08, my + 0.18, label, fontsize=8, color='#374151',
                ha='center', va='center', fontstyle='italic', zorder=8,
                bbox=dict(boxstyle='round,pad=0.14', fc=WHITE,
                          ec='#D1D5DB', alpha=0.93, lw=0.7))

def sep_line(x0, y, x1, color='#E5E7EB', lw=1, ls='--'):
    ax.plot([x0, x1], [y, y], color=color, lw=lw, linestyle=ls, zorder=4)

# ══════════════════════════════════════════════════════════════════════════
# TÍTULO
# ══════════════════════════════════════════════════════════════════════════
txt(7, 7.70, 'Flujo del agente conversacional — doble llamada al LLM',
    size=13, bold=True, color='#111827')

# ══════════════════════════════════════════════════════════════════════════
# COLUMNA PRINCIPAL  — x ≈ 1.6 a 9.2
# ══════════════════════════════════════════════════════════════════════════
# Dimensiones comunes
BW, BH = 3.4, 0.72   # proceso normal
LW, LH = 3.8, 1.62   # bloque LLM (más alto)
CX_MAIN = 4.0         # centro eje principal

# ── Paso 1: Usuario escribe ──────────────────────────────────────────────
P1_X, P1_Y = CX_MAIN - BW / 2, 6.55
rbox(P1_X, P1_Y, BW, BH, C_FRONT, r=0.22)
txt(CX_MAIN, P1_Y + BH * 0.62, 'USUARIO', size=7.5, color='#AAC8E8', bold=True)
txt(CX_MAIN, P1_Y + BH * 0.28,
    '"¿Llego bien si salgo a las 8?"', size=9.5, color=WHITE, italic=True)

arr(CX_MAIN, P1_Y, CX_MAIN, P1_Y - 0.25,
    label='POST /agent/chat  {message, history}')

# ── Paso 2: FastAPI recibe ────────────────────────────────────────────────
P2_X, P2_Y = CX_MAIN - BW / 2, 5.40
rbox(P2_X, P2_Y, BW, BH, C_API, r=0.22)
txt(CX_MAIN, P2_Y + BH * 0.62, 'FASTAPI  /agent/chat',
    size=7.5, color='#88D4AA', bold=True)
txt(CX_MAIN, P2_Y + BH * 0.28, 'agent.py  —  recibe petición',
    size=9.5, color=WHITE)

arr(CX_MAIN, P2_Y, CX_MAIN, P2_Y - 0.25)

# ── LLM Llamada 1 ────────────────────────────────────────────────────────
L1_X, L1_Y = CX_MAIN - LW / 2, 3.88
rbox(L1_X, L1_Y, LW, LH, C_LLM, r=0.28, ec='#A78BFA', lw=1.8)
# cabecera
rbox(L1_X + 0.14, L1_Y + LH - 0.48, LW - 0.28, 0.38, C_LLM_L, r=0.14, zorder=4)
txt(CX_MAIN, L1_Y + LH - 0.29,
    'LLM — Llamada 1  (Extracción)   [temp=0.1]',
    size=9, bold=True, color=WHITE)
# interior
rbox(L1_X + 0.14, L1_Y + 0.08, LW - 0.28, LH - 0.64, '#3B1F66', r=0.14, zorder=4)
txt(CX_MAIN, L1_Y + LH - 0.82,
    'Prompt: extrae JSON estructurado', size=8.5, color='#D4B8F0')
txt(CX_MAIN, L1_Y + LH - 1.12,
    '{origin, destination, arrival_datetime, question_type}',
    size=8, color='#C4A8F0', mono=True)
txt(CX_MAIN, L1_Y + 0.30,
    'Salida: JSON estructurado', size=8.5, color='#88D4AA')

arr(CX_MAIN, L1_Y, CX_MAIN, L1_Y - 0.24)

# ── Decisión — rombo ──────────────────────────────────────────────────────
D_CX, D_CY = CX_MAIN, 3.16
diamond(D_CX, D_CY, 1.20, 0.50, C_DEC_F, C_DEC, lw=2.0, zorder=4)
txt(D_CX, D_CY, '¿JSON válido?', size=9.5, bold=True, color='#78350F')

# flecha SÍ → Pipeline
arr(D_CX, D_CY - 0.50, D_CX, D_CY - 0.88, label='SÍ')

# ── Pipeline LSTM ─────────────────────────────────────────────────────────
PL_X, PL_Y = CX_MAIN - LW / 2, 1.50
PL_H = 1.34
rbox(PL_X, PL_Y, LW, PL_H, C_PIPE_B, r=0.28, ec='#86EFAC', lw=1.5)
rbox(PL_X + 0.14, PL_Y + PL_H - 0.42, LW - 0.28, 0.34, '#25804F', r=0.12, zorder=4)
txt(CX_MAIN, PL_Y + PL_H - 0.25,
    'PIPELINE  predictor.py', size=9, bold=True, color=WHITE)
# 4 etapas en línea
stages_lbl = ['① Routing\nOSMnx', '② Meteo\nOpen-Meteo', '③ LSTM\nInferencia', '④ BPR\n+ Semáforos']
sw = (LW - 0.28) / 4
for i, sl in enumerate(stages_lbl):
    sx = PL_X + 0.14 + i * sw
    rbox(sx + 0.04, PL_Y + 0.08, sw - 0.08, PL_H - 0.58, '#A04010', r=0.12, zorder=5)
    txt(sx + sw / 2, PL_Y + 0.46, sl, size=7.5, color='#F9D5B0')
    if i < 3:
        ax.annotate('', xy=(sx + sw - 0.01, PL_Y + 0.46),
                    xytext=(sx + sw - 0.12, PL_Y + 0.46),
                    arrowprops=dict(arrowstyle='->', color='#F4C89A', lw=1.0), zorder=6)

arr(CX_MAIN, PL_Y, CX_MAIN, PL_Y - 0.25,
    label='ETA + desglose + sensores')

# ── LLM Llamada 2 ─────────────────────────────────────────────────────────
L2_X, L2_Y = CX_MAIN - LW / 2 + 4.2, 3.88  # columna derecha
rbox(L2_X, L2_Y, LW, LH, C_LLM, r=0.28, ec='#A78BFA', lw=1.8)
rbox(L2_X + 0.14, L2_Y + LH - 0.48, LW - 0.28, 0.38, C_LLM_L, r=0.14, zorder=4)
txt(L2_X + LW / 2, L2_Y + LH - 0.29,
    'LLM — Llamada 2  (Generación)   [temp=0.6]',
    size=9, bold=True, color=WHITE)
rbox(L2_X + 0.14, L2_Y + 0.08, LW - 0.28, LH - 0.64, '#3B1F66', r=0.14, zorder=4)
txt(L2_X + LW / 2, L2_Y + LH - 0.82,
    'Recibe: ETA + meteo + carga sensores', size=8.5, color='#D4B8F0')
txt(L2_X + LW / 2, L2_Y + LH - 1.12,
    'Genera: respuesta en español', size=8.5, color='#D4B8F0')
txt(L2_X + LW / 2, L2_Y + 0.30,
    'con emojis + consejos de ruta', size=8.5, color='#88D4AA')

# ── Paso final: React muestra respuesta ───────────────────────────────────
RF_X, RF_Y = L2_X, 2.88
rbox(RF_X, RF_Y, LW, BH, C_FRONT, r=0.22)
txt(RF_X + LW / 2, RF_Y + BH * 0.65, 'REACT — Pantalla Agente',
    size=7.5, color='#AAC8E8', bold=True)
txt(RF_X + LW / 2, RF_Y + BH * 0.28,
    'Muestra respuesta en burbuja de chat', size=9.5, color=WHITE)

# ══════════════════════════════════════════════════════════════════════════
# CONEXIONES entre columna izquierda y derecha
# ══════════════════════════════════════════════════════════════════════════

# Pipeline → LLM 2  (curva)
arr(CX_MAIN + LW / 2, PL_Y + PL_H / 2,
    L2_X, L2_Y + LH / 2,
    label='ETA + datos', r=-0.15, color=C_PIPE_B)

# LLM 2 → React muestra
arr(L2_X + LW / 2, L2_Y, L2_X + LW / 2, RF_Y + BH,
    label='respuesta generada')

# ══════════════════════════════════════════════════════════════════════════
# RAMA ERROR — derecha del rombo
# ══════════════════════════════════════════════════════════════════════════
ERR_X, ERR_Y = 8.55, 2.60
ERR_W, ERR_H = 3.6, 1.32
rbox(ERR_X, ERR_Y, ERR_W, ERR_H, '#7F1D1D', r=0.22,
     ec='#FCA5A5', lw=1.5)
rbox(ERR_X + 0.12, ERR_Y + ERR_H - 0.42, ERR_W - 0.24, 0.34,
     '#991B1B', r=0.12, zorder=4)
txt(ERR_X + ERR_W / 2, ERR_Y + ERR_H - 0.25,
    'RAMA DE ERROR', size=8.5, bold=True, color='#FCA5A5')
txt(ERR_X + ERR_W / 2, ERR_Y + 0.68,
    'Ollama no disponible', size=9, color=WHITE)
txt(ERR_X + ERR_W / 2, ERR_Y + 0.36,
    'HTTP 503 → card de error en frontend', size=8.5, color='#FCA5A5')

# Rombo → Error (NO)
arr(D_CX + 1.20, D_CY, ERR_X, ERR_Y + ERR_H / 2,
    label='NO', color=C_ERR, lw=1.5)

# Ollama no disponible → también desde paso 3 (FastAPI)
arr(P2_X + BW, P2_Y + BH / 2, ERR_X, ERR_Y + ERR_H - 0.1,
    label='Ollama\nno disponible', color='#F87171', lw=1.2, r=0.1)

# ══════════════════════════════════════════════════════════════════════════
# ANOTACIÓN pide aclaración
# ══════════════════════════════════════════════════════════════════════════
ax.text(D_CX - 1.75, D_CY + 0.10,
        '← pide aclaración\n   al usuario',
        fontsize=8, color='#78350F', fontstyle='italic',
        ha='center', va='center', zorder=6)
ax.annotate('', xy=(D_CX - 1.22, D_CY + 0.05),
            xytext=(D_CX - 1.38, D_CY + 0.10),
            arrowprops=dict(arrowstyle='->', color=C_DEC, lw=1.2), zorder=7)

# ══════════════════════════════════════════════════════════════════════════
# LEYENDA
# ══════════════════════════════════════════════════════════════════════════
legend = [
    (C_FRONT, 'Frontend React'),
    (C_API,   'FastAPI / Backend'),
    (C_LLM,   'LLM (Ollama)'),
    (C_PIPE_B,'Pipeline LSTM'),
    (C_ERR,   'Rama de error'),
]
lx, ly = 0.25, 0.50
for i, (c, lbl) in enumerate(legend):
    xi = lx + i * 2.70
    rbox(xi, ly - 0.13, 0.28, 0.28, c, r=0.06, zorder=5)
    ax.text(xi + 0.38, ly, lbl, fontsize=8.5, color='#374151',
            va='center', zorder=5)

# ══════════════════════════════════════════════════════════════════════════
plt.tight_layout(pad=0.2)
out = (r'c:\Users\aserr\Documents\GitHub'
       r'\TFG-Alejandro-Serrano-Catalina\outputs\figures'
       r'\fig_flujo_agente.png')
plt.savefig(out, dpi=180, bbox_inches='tight', facecolor=WHITE)
print(f'OK → {out}')
plt.close()
