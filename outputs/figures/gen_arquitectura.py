"""Genera fig_arquitectura_sistema.png — TFG Alejandro Serrano."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

# ── Paleta ──────────────────────────────────────────────────────────────────
C_USER  = '#4A5568'
C_FRONT = '#1E3A5F'
C_API   = '#1A5C38'
C_PIPE  = '#C05621'
C_ART   = '#2D4A6E'
C_LLM   = '#553C7B'
C_ARROW = '#444444'
WHITE   = '#FFFFFF'

fig, ax = plt.subplots(figsize=(16, 10))
ax.set_xlim(0, 16)
ax.set_ylim(0, 10)
ax.axis('off')
fig.patch.set_facecolor(WHITE)
ax.set_facecolor(WHITE)

# ── Helpers ──────────────────────────────────────────────────────────────────
def rbox(x, y, w, h, color, radius=0.28, alpha=1.0, zorder=3):
    p = FancyBboxPatch((x, y), w, h,
                       boxstyle=f'round,pad=0,rounding_size={radius}',
                       facecolor=color, edgecolor='none',
                       alpha=alpha, zorder=zorder)
    ax.add_patch(p)

def txt(x, y, s, size=9, color=WHITE, bold=False, mono=False,
        ha='center', va='center', zorder=5, italic=False, extra_kw=None):
    kw = dict(fontsize=size, color=color, ha=ha, va=va, zorder=zorder)
    if bold:   kw['fontweight'] = 'bold'
    if mono:   kw['fontfamily'] = 'monospace'
    if italic: kw['fontstyle'] = 'italic'
    if extra_kw: kw.update(extra_kw)
    ax.text(x, y, s, **kw)

def arrow_v(x, y_from, y_to, color=C_ARROW, lw=1.5):
    """Flecha vertical de y_from hacia y_to."""
    ax.annotate('', xy=(x, y_to), xytext=(x, y_from),
                arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                                connectionstyle='arc3,rad=0'), zorder=7)

def arrow_h(x_from, x_to, y, color=C_ARROW, lw=1.6, label='', double=True):
    style = '<->' if double else '->'
    ax.annotate('', xy=(x_to, y), xytext=(x_from, y),
                arrowprops=dict(arrowstyle=style, color=color, lw=lw,
                                connectionstyle='arc3,rad=0'), zorder=7)
    if label:
        mx = (x_from + x_to) / 2
        ax.text(mx, y + 0.22, label, fontsize=8, color='#333333',
                ha='center', va='center', fontstyle='italic', zorder=8,
                bbox=dict(boxstyle='round,pad=0.16', fc=WHITE,
                          ec='#CCCCCC', alpha=0.92, lw=0.8))

def subitems_top_down(bx, bw, top_y, items, item_h, item_gap,
                      bg_color, label_color, desc_color, r=0.18):
    """Dibuja subelementos apilados de arriba (top_y) hacia abajo."""
    for i, row in enumerate(items):
        title = row[0]
        desc  = row[1] if len(row) > 1 else ''
        sy = top_y - (i + 1) * item_h - i * item_gap
        rbox(bx + 0.2, sy, bw - 0.4, item_h, bg_color, radius=r, zorder=4)
        if desc:
            txt(bx + bw / 2, sy + item_h - 0.38, title,
                size=8.5, bold=True, color=label_color)
            txt(bx + bw / 2, sy + 0.30, desc,
                size=7.5, color=desc_color)
        else:
            txt(bx + bw / 2, sy + item_h / 2, title,
                size=9, bold=True, color=label_color, mono=True)

# ════════════════════════════════════════════════════════════════════════════
# TÍTULO
# ════════════════════════════════════════════════════════════════════════════
txt(8, 9.55, 'Arquitectura del sistema de predicción de tráfico',
    size=14, bold=True, color='#1A202C')

# ════════════════════════════════════════════════════════════════════════════
# B1 — USUARIO
# ════════════════════════════════════════════════════════════════════════════
U_X, U_Y, U_W, U_H = 0.18, 3.9, 1.55, 2.3
rbox(U_X, U_Y, U_W, U_H, C_USER, radius=0.3)
cx = U_X + U_W / 2
ax.add_patch(plt.Circle((cx, U_Y + U_H - 0.60), 0.27, color=WHITE, zorder=5))
xs = [cx - 0.37, cx - 0.20, cx + 0.20, cx + 0.37]
ys = [U_Y + U_H - 1.28, U_Y + U_H - 0.90,
      U_Y + U_H - 0.90, U_Y + U_H - 1.28]
ax.fill(xs, ys, color=WHITE, zorder=5)
txt(cx, U_Y + 0.38, 'Usuario', size=11, bold=True)

# ════════════════════════════════════════════════════════════════════════════
# B2 — FRONTEND
# ════════════════════════════════════════════════════════════════════════════
F_X, F_Y, F_W, F_H = 2.05, 1.4, 3.0, 7.2
rbox(F_X, F_Y, F_W, F_H, C_FRONT, radius=0.35)
txt(F_X + F_W / 2, F_Y + F_H - 0.38, 'FRONTEND', size=10, bold=True)
txt(F_X + F_W / 2, F_Y + F_H - 0.72, 'React 18 + Vite  ·  :5173',
    size=8, color='#AAC8E8')

# subblocks: top-down order  [Pantalla Ruta, Agente, Ajustes]
front_subs = [
    ('Pantalla Ruta',    'Formulario + Mapa Leaflet'),
    ('Pantalla Agente',  'Chat multi-turno'),
    ('Pantalla Ajustes', 'localStorage + SettingsContext'),
]
sub_h, sub_gap = 1.60, 0.22
top_start = F_Y + F_H - 0.95  # justo bajo el header
subitems_top_down(F_X, F_W, top_start, front_subs, sub_h, sub_gap,
                  '#2A5298', WHITE, '#C8DFFB')

# ════════════════════════════════════════════════════════════════════════════
# B3 — API REST
# ════════════════════════════════════════════════════════════════════════════
A_X, A_Y, A_W, A_H = 5.45, 3.1, 2.3, 3.9
rbox(A_X, A_Y, A_W, A_H, C_API, radius=0.35)
txt(A_X + A_W / 2, A_Y + A_H - 0.38, 'API REST', size=10, bold=True)
txt(A_X + A_W / 2, A_Y + A_H - 0.72, 'FastAPI  ·  :8001',
    size=8, color='#88D4AA')

# endpoints top-down
endpoints = [('POST  /predict', ''), ('POST  /agent/chat', '')]
ep_h, ep_gap = 0.82, 0.25
ep_top = A_Y + A_H - 0.95
subitems_top_down(A_X, A_W, ep_top, endpoints, ep_h, ep_gap,
                  '#25804F', WHITE, WHITE)

# ════════════════════════════════════════════════════════════════════════════
# B4 — PIPELINE
# ════════════════════════════════════════════════════════════════════════════
P_X, P_Y, P_W, P_H = 8.1, 1.4, 3.1, 7.2
rbox(P_X, P_Y, P_W, P_H, C_PIPE, radius=0.35)
txt(P_X + P_W / 2, P_Y + P_H - 0.38, 'PIPELINE', size=10, bold=True)
txt(P_X + P_W / 2, P_Y + P_H - 0.72, 'predictor.py',
    size=8, color='#F4C89A')

# etapas top-down: Routing → Meteorología → LSTM → BPR
stages = [
    ('① Routing',         'OSMnx · Dijkstra · Nominatim'),
    ('② Meteorología',    'Open-Meteo API'),
    ('③ Inferencia LSTM', 'lstm_last.keras'),
    ('④ Cálculo BPR',     '+ Semáforos OSM'),
]
st_h, st_gap = 1.28, 0.22
st_top = P_Y + P_H - 0.95
stage_ys = []
for i, (stitle, sdesc) in enumerate(stages):
    sy = st_top - (i + 1) * st_h - i * st_gap
    stage_ys.append(sy)
    rbox(P_X + 0.2, sy, P_W - 0.4, st_h, '#A04010', radius=0.18, zorder=4)
    txt(P_X + P_W / 2, sy + st_h - 0.36, stitle, size=9, bold=True,
        color=WHITE)
    txt(P_X + P_W / 2, sy + 0.32, sdesc, size=7.8, color='#F9D5B0')
    # flecha hacia la siguiente etapa (apuntando hacia abajo)
    if i < len(stages) - 1:
        gap_mid = sy - st_gap / 2
        arrow_v(P_X + P_W / 2, sy - 0.02, sy - st_gap + 0.02,
                color='#F4C89A', lw=1.3)

# ════════════════════════════════════════════════════════════════════════════
# B5 — ARTEFACTOS
# ════════════════════════════════════════════════════════════════════════════
AR_X, AR_Y, AR_W, AR_H = 11.65, 2.7, 2.85, 4.6
rbox(AR_X, AR_Y, AR_W, AR_H, C_ART, radius=0.35)
txt(AR_X + AR_W / 2, AR_Y + AR_H - 0.36, 'ARTEFACTOS EN DISCO',
    size=9, bold=True)

arts = [
    ('lstm_last.keras', ''),
    ('scaler_X / scaler_Y  (.pkl)', ''),
    ('historical_profiles.pkl', ''),
    ('grafo_osm.graphml', ''),
]
art_h, art_gap = 0.72, 0.18
art_top = AR_Y + AR_H - 0.70
subitems_top_down(AR_X, AR_W, art_top, arts, art_h, art_gap,
                  '#3D607A', WHITE, WHITE, r=0.15)

# ════════════════════════════════════════════════════════════════════════════
# B6 — LLM LOCAL
# ════════════════════════════════════════════════════════════════════════════
L_X, L_Y, L_W, L_H = 5.45, 0.25, 2.3, 2.3
rbox(L_X, L_Y, L_W, L_H, C_LLM, radius=0.35)
txt(L_X + L_W / 2, L_Y + L_H - 0.38, 'LLM LOCAL', size=10, bold=True)
txt(L_X + L_W / 2, L_Y + L_H - 0.72, 'Ollama + Llama 3  ·  :11434',
    size=7.5, color='#D4B8F0')
rbox(L_X + 0.2, L_Y + 0.28, L_W - 0.4, 0.82, '#7B50B0', radius=0.15, zorder=4)
txt(L_X + L_W / 2, L_Y + 0.69,
    'Generación de texto + razonamiento',
    size=7.5, color=WHITE)

# ════════════════════════════════════════════════════════════════════════════
# FLECHAS
# ════════════════════════════════════════════════════════════════════════════

# 1. Usuario ↔ Frontend  (horizontal, nivel medio)
arrow_h(U_X + U_W, F_X, 5.0, color='#3A7BD5', label='HTTP/JSON')

# 2. Frontend ↔ /predict  (horizontal, nivel alto)
arrow_h(F_X + F_W, A_X, 5.45, color='#3A7BD5', label='REST JSON')

# 3. Frontend ↔ /agent/chat (horizontal, nivel bajo — a través del mismo punto)
arrow_h(F_X + F_W, A_X, 4.05, color='#3A7BD5', double=False)
ax.annotate('', xy=(F_X + F_W, 4.05), xytext=(A_X, 4.05),
            arrowprops=dict(arrowstyle='->', color='#3A7BD5', lw=1.4,
                            connectionstyle='arc3,rad=0'), zorder=7)

# 4. POST /predict → Pipeline  (horizontal)
pred_y = A_Y + A_H - 0.95 - ep_h / 2  # centro del endpoint /predict
arrow_h(A_X + A_W, P_X, pred_y, color=C_PIPE, double=False, label='')
ax.annotate('', xy=(P_X, pred_y), xytext=(A_X + A_W, pred_y),
            arrowprops=dict(arrowstyle='->', color=C_PIPE, lw=1.5,
                            connectionstyle='arc3,rad=0'), zorder=7)

# 5. Pipeline ↔ Artefactos  (horizontal, nivel medio)
pipe_mid_y = P_Y + P_H / 2
arrow_h(P_X + P_W, AR_X, pipe_mid_y, color=C_ART, label='lectura')

# 6. /agent/chat ↔ LLM  (vertical hacia abajo)
chat_y = A_Y + A_H - 0.95 - ep_h - ep_gap - ep_h / 2  # centro /agent/chat
ax.annotate('', xy=(A_X + A_W / 2, L_Y + L_H),
            xytext=(A_X + A_W / 2, chat_y),
            arrowprops=dict(arrowstyle='<->', color=C_LLM, lw=1.5,
                            connectionstyle='arc3,rad=0'), zorder=7)
ax.text(A_X + A_W / 2 + 0.22, (chat_y + L_Y + L_H) / 2,
        'HTTP\n:11434', fontsize=7.5, color=C_LLM,
        ha='left', va='center', fontstyle='italic', zorder=8)

# 7. LLM → Pipeline  (curva: el agente también usa el pipeline)
ax.annotate('', xy=(P_X, P_Y + 0.9),
            xytext=(L_X + L_W, L_Y + 0.5),
            arrowprops=dict(arrowstyle='->', color=C_LLM, lw=1.4,
                            connectionstyle='arc3,rad=-0.30'), zorder=7)
ax.text(7.55, 1.45, 'invoca', fontsize=8, color=C_LLM,
        ha='center', va='center', fontstyle='italic', zorder=8,
        bbox=dict(boxstyle='round,pad=0.16', fc=WHITE, ec='none', alpha=0.88))

# ════════════════════════════════════════════════════════════════════════════
# LEYENDA
# ════════════════════════════════════════════════════════════════════════════
legend = [
    (C_USER,  'Usuario'),
    (C_FRONT, 'Frontend'),
    (C_API,   'API REST'),
    (C_PIPE,  'Pipeline'),
    (C_ART,   'Artefactos'),
    (C_LLM,   'LLM Local'),
]
lx, ly = 0.25, 0.82
for i, (c, lbl) in enumerate(legend):
    xi = lx + i * 2.6
    rbox(xi, ly - 0.15, 0.30, 0.30, c, radius=0.06, zorder=5)
    ax.text(xi + 0.40, ly, lbl, fontsize=8.5, color='#333333',
            va='center', zorder=5)

# ════════════════════════════════════════════════════════════════════════════
plt.tight_layout(pad=0.2)
out = (r'c:\Users\aserr\Documents\GitHub'
       r'\TFG-Alejandro-Serrano-Catalina\outputs\figures'
       r'\fig_arquitectura_sistema.png')
plt.savefig(out, dpi=180, bbox_inches='tight', facecolor=WHITE)
print(f'OK → {out}')
plt.close()
