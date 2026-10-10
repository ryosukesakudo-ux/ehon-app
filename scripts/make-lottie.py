"""サイトで使う自作の Lottie アニメーション（public/lottie/*.json）を作る。

LottieFiles などで好きな素材が見つかったら、同じファイル名で public/lottie/ に置き換えれば差し替わる。
実行: python3 scripts/make-lottie.py
"""
import json
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "lottie"

# サイトの色
CORAL = [0.941, 0.541, 0.424, 1]
YELLOW = [0.965, 0.769, 0.271, 1]
MINT = [0.486, 0.780, 0.659, 1]
BLUE = [0.184, 0.365, 0.659, 1]
PINK = [0.957, 0.663, 0.722, 1]
WHITE = [1, 1, 1, 1]
NAVY = [0.118, 0.184, 0.341, 1]
CREAM = [1, 0.973, 0.925, 1]
PAGE = [1, 1, 1, 1]
LINE = [0.894, 0.871, 0.827, 1]
TEXT = [0.776, 0.831, 0.902, 1]

EASE_OUT = {"i": {"x": [0.2], "y": [1]}, "o": {"x": [0.4], "y": [0]}}
LINEAR = {"i": {"x": [1], "y": [1]}, "o": {"x": [0], "y": [0]}}


def static(v):
    return {"a": 0, "k": v}


def anim(keys, ease=EASE_OUT):
    """keys: [(frame, value), ...]。最後のキー以外にイージングを付ける。"""
    out = []
    for n, (t, v) in enumerate(keys):
        k = {"t": t, "s": v if isinstance(v, list) else [v]}
        if n < len(keys) - 1:
            k.update(ease)
        out.append(k)
    return {"a": 1, "k": out}


def tr(p=(0, 0), s=100, r=0, o=100):
    return {"ty": "tr", "p": static(list(p)), "a": static([0, 0]), "s": static([s, s]), "r": static(r), "o": static(o)}


def fill(c):
    return {"ty": "fl", "c": static(c), "o": static(100), "r": 1}


def stroke(c, w):
    return {"ty": "st", "c": static(c), "o": static(100), "w": static(w), "lc": 2, "lj": 2}


def group(*items, transform=None):
    return {"ty": "gr", "it": list(items) + [transform or tr()]}


def path(vertices, ins=None, outs=None, closed=True):
    n = len(vertices)
    return {"ty": "sh", "ks": static({"v": vertices, "i": ins or [[0, 0]] * n, "o": outs or [[0, 0]] * n, "c": closed})}


def sparkle_path(r):
    """4つの先がとがった、きらきらの形"""
    tips = [[0, -r], [r, 0], [0, r], [-r, 0]]
    k = 0.8 * r
    ins = [[-k, 0], [0, -k], [k, 0], [0, k]]
    outs = [[k, 0], [0, k], [-k, 0], [0, -k]]
    # 先端から次の先端へ、中心に向かってへこむ曲線にする
    ins = [[0, 0]] * 4
    outs = [[0, 0]] * 4
    for n in range(4):
        a, b = tips[n], tips[(n + 1) % 4]
        outs[n] = [(-a[0]) * 0.55, (-a[1]) * 0.55]
        ins[(n + 1) % 4] = [(-b[0]) * 0.55, (-b[1]) * 0.55]
    return path(tips, ins, outs)


def layer(ind, shapes, op, p=(0, 0), s=None, r=None, o=None, ip=0):
    return {
        "ddd": 0, "ind": ind, "ty": 4, "nm": f"layer{ind}", "sr": 1, "ao": 0, "bm": 0,
        "ks": {
            "o": o or static(100),
            "r": r or static(0),
            "p": p if isinstance(p, dict) else static(list(p) + [0]),
            "a": static([0, 0, 0]),
            "s": s or static([100, 100, 100]),
        },
        "shapes": shapes, "ip": ip, "op": op, "st": 0,
    }


def doc(name, w, h, op, layers, fr=30):
    return {"v": "5.7.4", "fr": fr, "ip": 0, "op": op, "w": w, "h": h, "nm": name, "ddd": 0, "assets": [], "layers": layers}


def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, separators=(",", ":")))


def twinkle(ind, x, y, size, color, delay, op):
    """ふわっと出て、少し回って消えるきらきら"""
    s = anim([(delay, [0, 0, 100]), (delay + 14, [100, 100, 100]), (delay + 40, [0, 0, 100])])
    r = anim([(delay, 0), (delay + 40, 90)], LINEAR)
    return layer(ind, [group(sparkle_path(size), fill(color))], op, p=(x, y), s=s, r=r)


# --- 1. トップの絵本のまわりのきらきら（300x300、ループ） ---
def sparkles():
    op = 90
    stars = [
        (34, 70, 22, YELLOW, 0), (266, 44, 16, WHITE, 12), (276, 196, 20, YELLOW, 20),
        (26, 214, 15, WHITE, 40), (150, 14, 14, PINK, 46), (282, 120, 13, WHITE, 50),
        (58, 136, 12, WHITE, 6), (232, 260, 14, PINK, 30),
    ]
    layers = [twinkle(n + 1, x, y, sz, c, d, op) for n, (x, y, sz, c, d) in enumerate(stars)]
    save("sparkles", doc("sparkles", 300, 300, op, layers))


# --- 2. 絵を描いている待ち時間（240x180、ループ） ---
def drawing():
    op = 96
    # 開いた本（左右のページ）
    book = layer(10, [
        # 上に重なるものほど先に書く（Lottieは先頭が手前）
        group(path([[0, -58], [0, 58]], closed=False), stroke(LINE, 3)),
        group(path([[-84, -30], [-24, -30]], closed=False), stroke(TEXT, 5)),
        group(path([[-84, -12], [-30, -12]], closed=False), stroke(TEXT, 5)),
        group(path([[-84, 6], [-40, 6]], closed=False), stroke(TEXT, 5)),
        group({"ty": "rc", "p": static([-52, 0]), "s": static([100, 120]), "r": static(10)}, fill(PAGE), stroke(LINE, 3)),
        group({"ty": "rc", "p": static([52, 0]), "s": static([100, 120]), "r": static(10)}, fill(PAGE), stroke(LINE, 3)),
    ], op, p=(120, 96))

    # 右ページに描かれていく絵（丘と太陽）
    hill_pts = [[14, 30], [40, 4], [62, 22], [90, 0]]
    hill = {"ty": "sh", "ks": static({"v": hill_pts, "i": [[0, 0], [-10, 0], [-8, 0], [-10, 0]], "o": [[10, 0], [8, 0], [10, 0], [0, 0]], "c": False})}
    trim1 = {"ty": "tm", "s": static(0), "e": anim([(0, 0), (40, 100), (84, 100), (90, 0)]), "o": static(0), "m": 1}
    sun = {"ty": "el", "p": static([74, -32]), "s": static([22, 22])}
    trim2 = {"ty": "tm", "s": static(0), "e": anim([(40, 0), (58, 100), (84, 100), (90, 0)]), "o": static(0), "m": 1}
    picture = layer(9, [
        group(hill, stroke(MINT, 6), trim1),
        group(sun, stroke(YELLOW, 6), trim2),
    ], op, p=(120, 96))

    # ペン（描いている線の先を追いかける）
    pen_shape = [
        group({"ty": "rc", "p": static([0, -22]), "s": static([12, 40]), "r": static(4)}, fill(CORAL)),
        group(path([[-6, -2], [6, -2], [0, 12]]), fill(CREAM)),
        group(path([[-2, 7], [2, 7], [0, 12]]), fill(NAVY)),
    ]
    # 線の各点（本の中心からの位置）＋本の中心(120,96)
    route = [(0, (134, 126)), (14, (160, 100)), (26, (182, 118)), (40, (210, 96)), (49, (205, 64)), (58, (183, 64)), (70, (194, 50)), (90, (134, 126))]
    pen_p = anim([(t, [x, y - 4, 0]) for t, (x, y) in route], {"i": {"x": [0.5], "y": [0.5]}, "o": {"x": [0.5], "y": [0.5]}})
    pen = layer(2, pen_shape, op, p=pen_p, r=static(25))

    stars = [twinkle(3, 222, 30, 9, YELLOW, 60, op), twinkle(4, 148, 40, 7, PINK, 66, op)]
    save("drawing", doc("drawing", 240, 180, op, [pen] + stars + [picture, book]))


# --- 3. 注文完了の紙吹雪（360x400、1回だけ） ---
def confetti():
    op = 90
    rnd = random.Random(7)
    colors = [CORAL, YELLOW, MINT, BLUE, PINK]
    layers = []
    for n in range(36):
        x0 = rnd.uniform(10, 350)
        start = rnd.randint(0, 24)
        dur = rnd.randint(48, 66)
        y0 = rnd.uniform(-40, -10)
        x1 = x0 + rnd.uniform(-60, 60)
        spin = rnd.choice([-1, 1]) * rnd.uniform(240, 720)
        w, h = rnd.choice([(8, 14), (10, 10), (6, 16)])
        shape = {"ty": "rc", "p": static([0, 0]), "s": static([w, h]), "r": static(2)} if n % 4 else {"ty": "el", "p": static([0, 0]), "s": static([10, 10])}
        p = anim([(start, [x0, y0, 0]), (start + dur, [x1, 420, 0])], {"i": {"x": [0.6], "y": [0.9]}, "o": {"x": [0.3], "y": [0.2]}})
        r = anim([(start, 0), (start + dur, spin)], LINEAR)
        # 横にひらひらさせるため、幅を伸び縮みさせる
        flutter = [(start + k * 8, [100 if k % 2 == 0 else 25, 100, 100]) for k in range(dur // 8 + 1)]
        s = anim(flutter, LINEAR)
        layers.append(layer(n + 1, [group(shape, fill(rnd.choice(colors)))], op, p=p, r=r, s=s))
    save("confetti", doc("confetti", 360, 400, op, layers))


# --- 4. 写真を選んだときのチェック（80x80、1回だけ） ---
def check():
    op = 36
    circle = layer(2, [group({"ty": "el", "p": static([0, 0]), "s": static([64, 64])}, fill(MINT))], op, p=(40, 40),
                   s=anim([(0, [0, 0, 100]), (10, [112, 112, 100]), (16, [100, 100, 100])]))
    tick = {"ty": "sh", "ks": static({"v": [[-14, 1], [-4, 11], [15, -10]], "i": [[0, 0]] * 3, "o": [[0, 0]] * 3, "c": False})}
    trim = {"ty": "tm", "s": static(0), "e": anim([(10, 0), (24, 100)]), "o": static(0), "m": 1}
    mark = layer(1, [group(tick, stroke(WHITE, 7), trim)], op, p=(40, 40))
    save("check", doc("check", 80, 80, op, [mark, circle]))


if __name__ == "__main__":
    sparkles()
    drawing()
    confetti()
    check()
    print("saved to", OUT)
