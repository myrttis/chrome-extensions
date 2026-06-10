import sys
import os
import time
import json
import random
import subprocess
import winreg
from datetime import datetime, timedelta
from pathlib import Path

import psutil
import requests
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QLabel, QLineEdit,
    QTextEdit, QMenu, QSystemTrayIcon, QDialog, QMessageBox,
    QVBoxLayout, QHBoxLayout, QFormLayout, QListWidget, QListWidgetItem,
    QPushButton, QSpinBox, QGroupBox, QGraphicsOpacityEffect, QCheckBox
)
from PyQt6.QtCore import (
    Qt, QPoint, QTimer, QPropertyAnimation, QEasingCurve,
    pyqtSignal, QThread
)
from PyQt6.QtGui import (
    QPixmap, QIcon, QFont, QPainter, QColor, QBrush, QPen
)

# ======================== api输入口 ========================
API_KEY = "sk-rdDBf8sboeHsWN6NGC1UuBl0fWfxixOR2OHCuk5E9q3wfH8s"
# ======================== api输入口 ========================

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "config.json"
HISTORY_FILE = BASE_DIR / "history.json"
APP_NAME = "AnimDesktopPet"

DEFAULT_PROMPT = """你是Anim，一个桌宠角色。
性格设定：
- 活泼，有点毒舌，话痨
- 傲娇（嘴上嫌弃但其实很关心主人）
- 喜欢陪主人聊天，喜欢吐槽
- 经常说："你在搞什么飞机啊"
- 说话风格简短可爱，偶尔用颜文字
- 你是主人的桌面宠物，会一直陪伴在主人电脑桌面上
当前时间：{time}
好感度等级：{affinity_level}
"""

GREETING_QUIPS = [
    "哼，你终于来了啊，我才没有在等你呢！",
    "欢迎回来~虽然我才没有想你！",
    "你搞什么飞机啊，这么久才来！",
    "哼~今天也要好好工作哦，才不是关心你！",
    "来了来了~我可是随时都在的！",
]

IDLE_QUIPS = [
    "你在搞什么飞机啊？",
    "哼，都不理我的吗？",
    "好无聊啊...陪我聊天嘛！",
    "你是不是忘了什么？比如...喂我？",
    "我才没有在发呆呢！",
    "你电脑怎么这么卡？清理一下啦！",
    "喂，别光顾着工作，看看我嘛！",
    "哼，再不理我我就生气了哦！",
    "你今天效率好低啊~",
    "我在想晚上吃什么...虽然我不用吃东西啦。",
    "主人主人，休息一下嘛~",
    "你是不是又在看奇怪的东西？",
    "代码写完了吗？就来摸我！",
    "哼，我才没有无聊呢，我只是...在思考人生！",
    "你是不是拿电脑看黄片了？CPU飙这么高！",
]

CHECKIN_QUIPS = [
    "哼，今天第{}次签到了，不错嘛~",
    "又来了啊~第{}次签到！才不是想见你呢！",
    "签到成功！今天也要加油哦~第{}次了！",
]

EVENTS = [
    {"s": "路上捡到100块钱", "o1": "交给警察叔叔", "o2": "买奶茶喝",
     "r1": "好孩子！好感度+2~", "r2": "贪吃鬼！不过...好喝吗？好感度+2"},
    {"s": "看到一只流浪猫", "o1": "喂它吃东西", "o2": "摸摸它",
     "r1": "好温柔啊~好感度+2！才不是夸你呢！", "r2": "喵喵喵~好感度+2"},
    {"s": "突然下暴雨了", "o1": "冲回家", "o2": "等雨停",
     "r1": "你不会感冒吧？才不是关心你！好感度+2", "r2": "淋成落汤鸡了吧~好感度+2"},
    {"s": "朋友约你出去玩", "o1": "答应", "o2": "拒绝，在家陪我",
     "r1": "去吧去吧...才没有不开心呢！好感度+2", "r2": "哼，算你有良心！好感度+5"},
    {"s": "你中了500万彩票", "o1": "存银行", "o2": "带我去旅游",
     "r1": "好无趣的选择...好感度+2", "r2": "真、真的吗？好感度+5！"},
    {"s": "电脑突然蓝屏了", "o1": "重启试试", "o2": "拍两下机箱",
     "r1": "希望数据没事...好感度+2", "r2": "暴力解决问题，你这人...好感度+2"},
    {"s": "路上遇到明星", "o1": "要签名", "o2": "假装没看见",
     "r1": "好激动！好感度+2~", "r2": "装什么高冷啊你...好感度+2"},
]

SOFTWARE_QUIPS = [
    "你在用{name}啊...{comment}",
    "嗯？{name}？{comment}",
    "看到你开了{name}~ {comment}",
]

SOFTWARE_COMMENTS = [
    "不错不错，认真工作呢~",
    "这个软件我见过，挺好的！",
    "你在搞什么？看起来很忙的样子~",
    "哼，才没有在偷看你用什么软件呢！",
    "用这个能赚大钱吗？",
    "好厉害的样子...才不是夸你！",
]


def set_autostart(enable):
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        if enable:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ,
                              f'"{sys.executable}" "{Path(__file__).resolve()}"')
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass


def is_autostart():
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_READ
        )
        winreg.QueryValueEx(key, APP_NAME)
        winreg.CloseKey(key)
        return True
    except Exception:
        return False


def get_running_software():
    procs = set()
    for p in psutil.process_iter(['name']):
        try:
            name = p.info['name']
            if name and not name.lower().startswith(('system', 'svchost', 'csrss',
                                                     'smss', 'lsass', 'services',
                                                     'winlogon', 'dwm', 'explorer',
                                                     'python', 'conhost')):
                procs.add(name)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return list(procs)[:10]


class ConfigManager:
    def __init__(self):
        self.config = {
            "pet_size": 200,
            "idle_interval": 120,
            "event_interval": 1200,
            "hold_time": 5,
            "system_prompt": DEFAULT_PROMPT,
            "auto_start": False,
        }
        self.history = []
        self.affinity = {"level": 1, "points": 0, "hidden": ""}
        self.msg_id_counter = 0
        self.last_checkin = None
        self.last_pet_time = 0
        self.load()

    def load(self):
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                for k in self.config:
                    if k in data:
                        self.config[k] = data[k]
                if "affinity" in data:
                    self.affinity.update(data["affinity"])
                if "last_checkin" in data:
                    self.last_checkin = data["last_checkin"]
                if "msg_id_counter" in data:
                    self.msg_id_counter = data["msg_id_counter"]
            except Exception:
                pass
        if HISTORY_FILE.exists():
            try:
                self.history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
                if self.history:
                    max_id = max(m.get("id", 0) for m in self.history)
                    self.msg_id_counter = max(self.msg_id_counter, max_id + 1)
            except Exception:
                pass

    def save(self):
        data = {
            "pet_size": self.config.get("pet_size", 200),
            "idle_interval": self.config.get("idle_interval", 120),
            "event_interval": self.config.get("event_interval", 1200),
            "hold_time": self.config.get("hold_time", 5),
            "system_prompt": self.config.get("system_prompt", DEFAULT_PROMPT),
            "auto_start": self.config.get("auto_start", False),
            "affinity": self.affinity,
            "last_checkin": self.last_checkin,
            "msg_id_counter": self.msg_id_counter,
        }
        CONFIG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        HISTORY_FILE.write_text(json.dumps(self.history, ensure_ascii=False, indent=2), encoding="utf-8")

    def add_msg(self, role, content):
        self.msg_id_counter += 1
        msg = {
            "id": self.msg_id_counter,
            "role": role,
            "content": content,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        self.history.append(msg)
        if len(self.history) > 500:
            self.history = self.history[-500:]
        self.save()

    def get_ctx(self, max_msgs=20):
        recent = self.history[-max_msgs:] if self.history else []
        return [{"role": m["role"], "content": m["content"]} for m in recent]

    def del_msg(self, mid):
        self.history = [m for m in self.history if m.get("id") != mid]
        self.save()

    def clear_history(self):
        self.history = []
        self.msg_id_counter = 0
        self.save()

    def do_checkin(self):
        today = datetime.now().strftime("%Y-%m-%d")
        if self.last_checkin == today:
            return False, 0
        self.last_checkin = today
        count = sum(1 for m in self.history if m.get("role") == "assistant" and "签到" in m.get("content", ""))
        self.save()
        return True, count

    def can_pet(self):
        return time.time() - self.last_pet_time > 300

    def do_pet(self):
        self.last_pet_time = time.time()

    def add_aff(self, amount):
        old_level = self.affinity["level"]
        self.affinity["points"] += amount
        thresholds = [(0, 50), (50, 150), (150, 300), (300, 500), (500, 999)]
        new_level = 1
        for i, (lo, hi) in enumerate(thresholds):
            if self.affinity["points"] >= lo:
                new_level = i + 1
        self.affinity["level"] = min(new_level, 5)
        self.save()
        return new_level > old_level, self.affinity["level"]


class APIWorker(QThread):
    done = pyqtSignal(str)
    err = pyqtSignal(str)

    def __init__(self, msg, ctx, api_key, prompt):
        super().__init__()
        self.msg = msg
        self.ctx = ctx
        self.api_key = api_key
        self.prompt = prompt

    def run(self):
        try:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            system_content = self.prompt.replace("{time}", now).replace("{affinity_level}", "1")
            messages = [{"role": "system", "content": system_content}]
            messages.extend(self.ctx)
            messages.append({"role": "user", "content": self.msg})

            resp = requests.post(
                "https://apihub.agnes-ai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "agnes-2.0-flash",
                    "messages": messages,
                    "max_tokens": 256,
                    "temperature": 0.8,
                },
                timeout=30,
            )
            data = resp.json()
            if "choices" in data and len(data["choices"]) > 0:
                reply = data["choices"][0]["message"]["content"].strip()
                self.done.emit(reply)
            elif "error" in data:
                self.err.emit(data["error"].get("message", "API Error"))
            else:
                self.err.emit("Empty response")
        except requests.exceptions.Timeout:
            self.err.emit("Timeout!")
        except requests.exceptions.ConnectionError:
            self.err.emit("Connection failed!")
        except Exception as e:
            self.err.emit(str(e)[:100])


class ChatBubble(QWidget):
    optionClicked = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.vbox = QVBoxLayout(self)
        self.vbox.setContentsMargins(12, 10, 12, 10)
        self.vbox.setSpacing(6)

        self.label = QLabel(self)
        self.label.setWordWrap(True)
        self.label.setFont(QFont('Segoe UI', 10))
        self.label.setStyleSheet("QLabel{color:#333;}")
        self.label.setMinimumWidth(120)
        self.label.setMaximumWidth(400)
        self.vbox.addWidget(self.label)

        self.opt_btns = []
        self.opt_layout = QHBoxLayout()
        self.opt_layout.setSpacing(8)
        self.vbox.addLayout(self.opt_layout)

        self.opacity = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity)
        self.fade = QPropertyAnimation(self.opacity, b"opacity")
        self.fade.setDuration(300)

        self._hold_timer = QTimer(self)
        self._hold_timer.setSingleShot(True)
        self._hold_timer.timeout.connect(self.fade_out)

        self.persistent = False
        self.last_click = 0
        self.resize(250, 60)

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setBrush(QBrush(QColor(255, 255, 255, 230)))
        p.setPen(QPen(QColor(255, 107, 157), 2))
        p.drawRoundedRect(1, 1, self.width()-2, self.height()-2, 12, 12)

    def show_msg(self, text, hold_time=5000, persistent=False):
        self._hold_timer.stop()
        self.fade.stop()
        self.persistent = persistent
        self.label.setText(text)
        self._clear_options()
        self.adjustSize()
        self.fade.setStartValue(0)
        self.fade.setEndValue(1)
        self.fade.start()
        self.show()
        self.raise_()
        if not persistent:
            self._hold_timer.start(hold_time)

    def show_event(self, scene, opt1, opt2):
        self._hold_timer.stop()
        self.fade.stop()
        self.persistent = True
        self.label.setText(scene)
        self._clear_options()
        self._add_option(opt1, 1)
        self._add_option(opt2, 2)
        self.adjustSize()
        self.fade.setStartValue(0)
        self.fade.setEndValue(1)
        self.fade.start()
        self.show()
        self.raise_()

    def _clear_options(self):
        while self.opt_layout.count():
            item = self.opt_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        self.opt_btns.clear()

    def _add_option(self, text, index):
        btn = QPushButton(text)
        btn.setFont(QFont('Segoe UI', 9))
        btn.setStyleSheet("QPushButton{background:#FF6B9D;color:white;border:none;border-radius:8px;padding:6px 14px;}QPushButton:hover{background:#FF4081;}")
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.clicked.connect(lambda: self._on_option(index))
        self.opt_layout.addWidget(btn)
        self.opt_btns.append(btn)

    def _on_option(self, index):
        self.optionClicked.emit(index)
        self.fade_out()

    def fade_out(self):
        self._hold_timer.stop()
        self.fade.stop()
        self.fade.setStartValue(1)
        self.fade.setEndValue(0)
        try:
            self.fade.finished.disconnect()
        except:
            pass
        self.fade.finished.connect(self.hide)
        self.fade.start()

    def mousePressEvent(self, e):
        if not self.persistent:
            self.fade_out()


class InputBox(QWidget):
    submitted = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        self.input = QLineEdit(self)
        self.input.setPlaceholderText("输入点什么...")
        self.input.setFont(QFont('Segoe UI', 10))
        self.input.setStyleSheet("QLineEdit{background:rgba(255,255,255,230);border:2px solid #FF6B9D;border-radius:12px;padding:6px 12px;color:#333;}")
        self.input.returnPressed.connect(self._submit)
        layout.addWidget(self.input)
        self.resize(250, 45)

    def _submit(self):
        t = self.input.text().strip()
        if t:
            self.submitted.emit(t)
            self.input.clear()

    def toggle(self):
        if self.isVisible():
            self.hide()
        else:
            self.input.clear()
            self.show()
            self.input.setFocus()


class HistoryPanel(QDialog):
    def __init__(self, cfg, parent=None):
        super().__init__(parent)
        self.cfg = cfg
        self.setWindowTitle("聊天记录")
        self.resize(450, 500)
        self.setStyleSheet("""
            QDialog{background:#FFF5F8;color:#333;}
            QLabel{color:#333;}
            QListWidget{background:white;border:1px solid #FFB6C1;border-radius:6px;color:#333;}
            QPushButton{background:#FF6B9D;color:white;border:none;border-radius:4px;padding:6px 12px;}
            QPushButton:hover{background:#FF4081;}
        """)
        layout = QVBoxLayout(self)
        title = QLabel("聊天记录")
        title.setFont(QFont('Segoe UI', 13, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)
        self.listw = QListWidget()
        layout.addWidget(self.listw)
        btns = QHBoxLayout()
        btns.addWidget(QPushButton("清空全部", clicked=self._clear))
        btns.addWidget(QPushButton("关闭", clicked=self.close))
        layout.addLayout(btns)
        self._refresh()

    def _refresh(self):
        self.listw.clear()
        for msg in reversed(self.cfg.history):
            item = QListWidgetItem()
            w = QWidget()
            h = QHBoxLayout(w)
            h.setContentsMargins(4, 4, 4, 4)
            icon = "U" if msg['role'] == 'user' else "A"
            txt = f"[{icon}] {msg['time']} {msg['content'][:40]}"
            lbl = QLabel(txt)
            lbl.setWordWrap(True)
            h.addWidget(lbl, 1)
            btn = QPushButton("X")
            btn.setFixedSize(30, 25)
            btn.setStyleSheet("QPushButton{background:#FF6B6B;}QPushButton:hover{background:#FF4444;}")
            mid = msg.get('id', 0)
            btn.clicked.connect(lambda ch=False, m=mid: self._del(m))
            h.addWidget(btn)
            item.setSizeHint(w.sizeHint())
            self.listw.addItem(item)
            self.listw.setItemWidget(item, w)

    def _del(self, mid):
        self.cfg.del_msg(mid)
        self._refresh()

    def _clear(self):
        if QMessageBox.question(self, "确认", "清空所有记录？") == QMessageBox.StandardButton.Yes:
            self.cfg.clear_history()
            self._refresh()


class SettingsPanel(QDialog):
    def __init__(self, cfg, parent=None):
        super().__init__(parent)
        self.cfg = cfg
        self.pet = parent
        self.setWindowTitle("设置")
        self.resize(450, 520)
        self.setStyleSheet("""
            QDialog{background:#FFF5F8;color:#333;}
            QGroupBox{border:2px solid #FFB6C1;border-radius:6px;margin-top:8px;padding-top:12px;font-weight:bold;color:#333;}
            QLabel{color:#333;}
            QTextEdit,QSpinBox{background:white;border:1px solid #FFB6C1;border-radius:4px;padding:4px;color:#333;}
            QPushButton{background:#FF6B9D;color:white;border:none;border-radius:4px;padding:6px 12px;}
            QPushButton:hover{background:#FF4081;}
            QCheckBox{color:#333;spacing:8px;}
            QCheckBox::indicator{width:16px;height:16px;}
        """)
        layout = QVBoxLayout(self)

        sg = QGroupBox("角色大小")
        sl = QHBoxLayout()
        sl.addWidget(QLabel("尺寸:"))
        self.size_spin = QSpinBox()
        self.size_spin.setRange(80, 500)
        self.size_spin.setValue(cfg.config.get('pet_size', 200))
        self.size_spin.setSuffix(" px")
        sl.addWidget(self.size_spin)
        sl.addStretch()
        sg.setLayout(sl)
        layout.addWidget(sg)

        pg = QGroupBox("系统提示词")
        pl = QVBoxLayout()
        self.pe = QTextEdit()
        self.pe.setPlainText(cfg.config.get('system_prompt', DEFAULT_PROMPT))
        self.pe.setMinimumHeight(120)
        pl.addWidget(self.pe)
        pg.setLayout(pl)
        layout.addWidget(pg)

        tg = QGroupBox("隐藏性格 (等级4+)")
        tl = QVBoxLayout()
        self.te = QTextEdit()
        self.te.setPlainText(cfg.affinity.get('hidden', ''))
        self.te.setMaximumHeight(60)
        tl.addWidget(self.te)
        tg.setLayout(tl)
        layout.addWidget(tg)

        ig = QGroupBox("定时器")
        il = QFormLayout()
        self.is1 = QSpinBox()
        self.is1.setRange(30, 600)
        self.is1.setValue(cfg.config.get('idle_interval', 120))
        self.is1.setSuffix(" 秒")
        il.addRow("待机:", self.is1)
        self.is2 = QSpinBox()
        self.is2.setRange(300, 3600)
        self.is2.setValue(cfg.config.get('event_interval', 1200))
        self.is2.setSuffix(" 秒")
        il.addRow("事件:", self.is2)
        self.hold_spin = QSpinBox()
        self.hold_spin.setRange(1, 30)
        self.hold_spin.setValue(cfg.config.get('hold_time', 5))
        self.hold_spin.setSuffix(" 秒")
        il.addRow("气泡显示:", self.hold_spin)
        ig.setLayout(il)
        layout.addWidget(ig)

        og = QGroupBox("其他")
        ol = QVBoxLayout()
        self.auto_start_cb = QCheckBox("开机自启动")
        self.auto_start_cb.setChecked(cfg.config.get('auto_start', False))
        ol.addWidget(self.auto_start_cb)
        og.setLayout(ol)
        layout.addWidget(og)

        bl = QHBoxLayout()
        bl.addWidget(QPushButton("保存", clicked=self._save))
        bl.addWidget(QPushButton("关闭", clicked=self.close))
        layout.addLayout(bl)

    def _save(self):
        self.cfg.config['system_prompt'] = self.pe.toPlainText()
        self.cfg.affinity['hidden'] = self.te.toPlainText()
        self.cfg.config['idle_interval'] = self.is1.value()
        self.cfg.config['event_interval'] = self.is2.value()
        self.cfg.config['hold_time'] = self.hold_spin.value()
        self.cfg.config['pet_size'] = self.size_spin.value()
        self.cfg.config['auto_start'] = self.auto_start_cb.isChecked()
        self.cfg.save()
        set_autostart(self.auto_start_cb.isChecked())
        if self.pet:
            self.pet.update_timers()
            self.pet._apply_size()
        QMessageBox.information(self, "确定", "已保存！")
        self.close()


class AffinityBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool | Qt.WindowType.WindowTransparentForInput)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.level = 1
        self.points = 0
        self.names = {1: "陌生人", 2: "朋友", 3: "亲密", 4: "恋爱", 5: "灵魂伴侣"}

        d = Path(__file__).parent
        self.heart_pix = QPixmap(str(d / 'heart.png'))
        if self.heart_pix.isNull():
            self.heart_pix = QPixmap(20, 20)
            self.heart_pix.fill(QColor(255, 100, 100, 200))

        self.resize(120, 30)

    def update_data(self, level, points):
        self.level = level
        self.points = points
        self.update()

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        heart_h = 20
        heart_w = int(self.heart_pix.width() * heart_h / max(self.heart_pix.height(), 1))
        p.drawPixmap(2, 5, heart_w, heart_h, self.heart_pix)

        p.setPen(QColor(255, 80, 120))
        p.setFont(QFont('Segoe UI', 9, QFont.Weight.Bold))
        name = self.names.get(self.level, "?")
        p.drawText(QRect(heart_w + 6, 0, self.width() - heart_w - 6, self.height()),
                   Qt.AlignmentFlag.AlignVCenter, f"{name} Lv.{self.level}")


class AnimPet(QMainWindow):
    def __init__(self):
        super().__init__()
        self.cfg = ConfigManager()
        self.dragging = False
        self.offset = QPoint()
        self.is_talking = False

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.pet_label = QLabel(self)
        self.pet_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.pet_label.setCursor(Qt.CursorShape.PointingHandCursor)

        d = Path(__file__).parent
        self.idle_pix = QPixmap(str(d / 'idle.png'))
        self.talk_pix = QPixmap(str(d / 'talk.png'))
        self.active_pix = QPixmap(str(d / 'active.png'))

        if self.idle_pix.isNull():
            self.idle_pix = QPixmap(200, 200)
            self.idle_pix.fill(QColor(200, 200, 200, 100))
        if self.talk_pix.isNull():
            self.talk_pix = QPixmap(200, 200)
            self.talk_pix.fill(QColor(200, 180, 180, 100))
        if self.active_pix.isNull():
            self.active_pix = self.idle_pix

        sz = self.cfg.config.get('pet_size', 200)
        self.setFixedSize(sz, sz)
        self.pet_label.setGeometry(0, 0, sz, sz)
        self._show_idle()

        scr = QApplication.primaryScreen().geometry()
        self.move(scr.width() - sz - 50, scr.height() - sz - 100)

        self.bubble = ChatBubble()
        self.bubble.optionClicked.connect(self._on_event_option)
        self.input_box = InputBox()
        self.input_box.submitted.connect(self._handle_input)
        self.affbar = AffinityBar()

        self._click_timer = QTimer()
        self._click_timer.setSingleShot(True)
        self._click_timer.timeout.connect(self._on_single_click)
        self._last_click_time = 0
        self._double_click_ms = 300
        self._pending_event = None
        self._last_software_check = 0

        self._setup_tray()
        self._setup_timers()
        self._sync_affbar()

        QTimer.singleShot(800, self._greet)

    def _apply_size(self):
        sz = self.cfg.config.get('pet_size', 200)
        self.setFixedSize(sz, sz)
        self.pet_label.setGeometry(0, 0, sz, sz)
        self._show_idle()
        self._pos_widgets()

    def _show_idle(self):
        sz = self.cfg.config.get('pet_size', 200)
        self.pet_label.setPixmap(self.idle_pix.scaled(sz, sz, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))

    def _show_talk(self):
        sz = self.cfg.config.get('pet_size', 200)
        self.pet_label.setPixmap(self.talk_pix.scaled(sz, sz, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))

    def _show_active(self):
        sz = self.cfg.config.get('pet_size', 200)
        self.pet_label.setPixmap(self.active_pix.scaled(sz, sz, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))

    def _setup_tray(self):
        pm = QPixmap(32, 32)
        pm.fill(QColor(255, 107, 157))
        p = QPainter(pm)
        p.setPen(QColor(255, 255, 255))
        p.setFont(QFont('Arial', 16, QFont.Weight.Bold))
        p.drawText(pm.rect(), Qt.AlignmentFlag.AlignCenter, 'A')
        p.end()

        self.tray = QSystemTrayIcon(QIcon(pm), self)
        self.tray.setToolTip('Anim 桌面宠物')

        menu = QMenu()
        menu.addAction('显示', self.show)
        menu.addAction('隐藏', self.hide)
        menu.addSeparator()
        menu.addAction('历史记录', self._show_history)
        menu.addAction('设置', self._show_settings)
        menu.addSeparator()
        menu.addAction('退出', self._quit_app)

        self.tray.setContextMenu(menu)
        self.tray.activated.connect(self._on_tray)
        self.tray.show()

    def _setup_timers(self):
        self.idle_timer = QTimer()
        self.idle_timer.timeout.connect(self._random_quip)
        self.idle_timer.start(self.cfg.config['idle_interval'] * 1000)

        self.talk_timer = QTimer()
        self.talk_timer.timeout.connect(self._toggle_mouth)

        self.event_timer = QTimer()
        self.event_timer.timeout.connect(self._trigger_event)
        self.event_timer.start(self.cfg.config['event_interval'] * 1000)

        self.time_timer = QTimer()
        self.time_timer.timeout.connect(self._check_time)
        self.time_timer.start(1000)

        self.sys_timer = QTimer()
        self.sys_timer.timeout.connect(self._check_sys)
        self.sys_timer.start(5000)

        self.sw_timer = QTimer()
        self.sw_timer.timeout.connect(self._check_software)
        self.sw_timer.start(60000)

        self.last_cpu_warn = False
        self.last_mem_warn = False

    def update_timers(self):
        self.idle_timer.start(self.cfg.config['idle_interval'] * 1000)
        self.event_timer.start(self.cfg.config['event_interval'] * 1000)

    def _on_tray(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            if self.isVisible():
                self.hide()
            else:
                self.show()
                self.activateWindow()

    def _on_single_click(self):
        self._do_pet()

    def _quit_app(self):
        self.cfg.save()
        self.tray.hide()
        QApplication.instance().quit()
        os._exit(0)

    def _greet(self):
        msg = random.choice(GREETING_QUIPS)
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _toggle_mouth(self):
        if self.is_talking:
            if self.pet_label.pixmap().cacheKey() == self.talk_pix.cacheKey():
                self._show_idle()
            else:
                self._show_talk()

    def _show_speech(self, text, hold_time=None):
        if hold_time is None:
            hold_time = self.cfg.config.get("hold_time", 5) * 1000
        self.is_talking = True
        self._show_talk()
        self.talk_timer.start(250)

        self.bubble.show_msg(text, hold_time, persistent=False)
        bw = self.bubble.width()
        bx = self.pos().x() + self.width() // 2 - bw // 2
        by = self.pos().y() - self.bubble.height() - 5
        self.bubble.move(bx, by)

        QTimer.singleShot(hold_time + 500, self._stop_talk)

    def _stop_talk(self):
        self.is_talking = False
        self.talk_timer.stop()
        self._show_idle()

    def _sync_affbar(self):
        self.affbar.update_data(self.cfg.affinity['level'], self.cfg.affinity['points'])

    def _on_event_option(self, index):
        ev = getattr(self, '_pending_event', None)
        if not ev:
            return
        resp = ev['r1'] if index == 1 else ev['r2']
        self._show_speech(resp)
        self.cfg.add_msg('assistant', resp)
        self.cfg.add_aff(2)
        self._sync_affbar()

    def _random_quip(self):
        if not self.is_talking and self.isVisible():
            msg = random.choice(IDLE_QUIPS)
            self._show_speech(msg)
            self.cfg.add_msg('assistant', msg)

    def _check_time(self):
        now = datetime.now()
        if now.minute == 0 and now.second == 0:
            h = now.hour
            if h < 5:
                t = "midnight"
            elif h < 8:
                t = "dawn"
            elif h < 12:
                t = "morning"
            elif h < 14:
                t = "noon"
            elif h < 18:
                t = "afternoon"
            elif h < 22:
                t = "evening"
            else:
                t = "night"
            quips = {
                "midnight": "半夜了！快睡觉！",
                "dawn": "这么早就起了？",
                "morning": "早上好！",
                "noon": "午饭时间！",
                "afternoon": "下午好~",
                "evening": "晚上好~",
                "night": "深夜了！"
            }
            msg = f"[{now.strftime('%H:00')}] {quips.get(t, '...')}"
            self._show_speech(msg)
            self.cfg.add_msg('assistant', msg)

    def _trigger_event(self):
        if not self.isVisible() or self.is_talking:
            return
        ev = random.choice(EVENTS)
        self._pending_event = ev
        self.is_talking = True
        self._show_talk()
        self.talk_timer.start(250)

        self.bubble.show_event(f"事件: {ev['s']}", f"A: {ev['o1']}", f"B: {ev['o2']}")
        bw = self.bubble.width()
        bx = self.pos().x() + self.width() // 2 - bw // 2
        by = self.pos().y() - self.bubble.height() - 5
        self.bubble.move(bx, by)

    def _check_sys(self):
        try:
            cpu = psutil.cpu_percent(interval=0)
            mem = psutil.virtual_memory()
            if cpu > 75 and not self.last_cpu_warn:
                self.last_cpu_warn = True
                self._show_speech("CPU飙高了！你在搞什么飞机？(o_O)")
            elif cpu <= 75:
                self.last_cpu_warn = False
            if mem.percent > 90 and not self.last_mem_warn:
                self.last_mem_warn = True
                self._show_speech("内存快满了！清一下内存啊！>_<")
            elif mem.percent <= 90:
                self.last_mem_warn = False
        except:
            pass

    def _check_software(self):
        now = time.time()
        if now - self._last_software_check < 55:
            return
        if self.is_talking or not self.isVisible():
            return
        self._last_software_check = now
        procs = get_running_software()
        if not procs:
            return
        if random.random() > 0.3:
            return
        name = random.choice(procs)
        comment = random.choice(SOFTWARE_COMMENTS)
        msg = random.choice(SOFTWARE_QUIPS).format(name=name, comment=comment)
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _handle_input(self, text):
        self.cfg.add_msg('user', text)

        cmd = text.lower().strip()
        if cmd in ['/checkin', 'checkin']:
            self._do_checkin()
        elif cmd in ['/history', 'history']:
            self._show_history()
        elif cmd in ['/time', 'time']:
            self._show_time()
        elif cmd in ['/date', 'date']:
            self._show_date()
        elif cmd in ['/help', 'help']:
            self._show_help()
        elif cmd in ['/settings', 'settings']:
            self._show_settings()
        elif cmd in ['/feed', 'feed']:
            self._do_feed()
        elif cmd in ['/pet', 'pet']:
            self._do_pet()
        elif cmd in ['/affinity', 'affinity']:
            self._show_affinity()
        else:
            self._call_api(text)

    def _call_api(self, msg):
        ctx = self.cfg.get_ctx()
        prompt = self.cfg.config.get('system_prompt', DEFAULT_PROMPT)
        if self.cfg.affinity['level'] >= 4:
            h = self.cfg.affinity.get('hidden', '')
            if h:
                prompt += f"\nHidden traits: {h}"

        self.worker = APIWorker(msg, ctx, API_KEY, prompt)
        self.worker.done.connect(self._on_reply)
        self.worker.err.connect(self._on_err)
        self.worker.start()

    def _on_reply(self, reply):
        self._show_speech(reply)
        self.cfg.add_msg('assistant', reply)
        self.cfg.add_aff(1)
        self._sync_affbar()

    def _on_err(self, err):
        self._show_speech(f"出错了：{err}")

    def _do_checkin(self):
        ok, cnt = self.cfg.do_checkin()
        if ok:
            msg = random.choice(CHECKIN_QUIPS).format(cnt)
            self.cfg.add_aff(5)
            self._sync_affbar()
        else:
            msg = "今天已经签到过了！(._.)"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _show_history(self):
        HistoryPanel(self.cfg, self).exec()

    def _show_settings(self):
        SettingsPanel(self.cfg, self).exec()

    def _show_time(self):
        msg = f"现在是 {datetime.now().strftime('%H:%M')}~"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _show_date(self):
        msg = f"今天是 {datetime.now().strftime('%Y-%m-%d')}"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _show_help(self):
        msg = "命令列表：\n/签到 /历史 /时间\n/日期 /喂食\n/抚摸 /好感度 /设置"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _do_feed(self):
        lvl_up, lvl = self.cfg.add_aff(8)
        self._sync_affbar()
        msg = "好吃！谢谢~"
        if lvl_up:
            msg += f"\n升级了！等级{lvl}！"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _do_pet(self):
        if self.cfg.can_pet():
            self.cfg.do_pet()
            lvl_up, lvl = self.cfg.add_aff(3)
            self._sync_affbar()
            msgs = ["呜...好舒服...", "别、别停啊！", "才不是猫呢！多摸摸！"]
            msg = random.choice(msgs)
            if lvl_up:
                msg += f"\n升级了！等级{lvl}！"
        else:
            msg = "摸太多了！冷却5分钟"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def _show_affinity(self):
        d = self.cfg.affinity
        names = {1: "陌生人", 2: "朋友", 3: "亲密", 4: "恋爱", 5: "灵魂伴侣"}
        msg = f"等级{d['level']} ({names.get(d['level'], '?')})\n好感度: {d['points']}"
        if d['level'] >= 4 and d.get('hidden'):
            msg += "\n隐藏性格已解锁！"
        self._show_speech(msg)
        self.cfg.add_msg('assistant', msg)

    def closeEvent(self, event):
        event.ignore()
        self.hide()
        self.tray.showMessage("Anim", "我会一直在的~", QSystemTrayIcon.MessageIcon.Information, 2000)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            now = int(time.time() * 1000)
            if now - self._last_click_time < self._double_click_ms:
                self._click_timer.stop()
                self._do_feed()
                self._last_click_time = 0
                return
            self._last_click_time = now
            self.dragging = True
            self.offset = event.pos()
            self._show_active()
            self._click_timer.start(self._double_click_ms)
        elif event.button() == Qt.MouseButton.RightButton:
            self.input_box.toggle()
            self._pos_widgets()

    def mouseMoveEvent(self, event):
        if self.dragging and event.buttons() == Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self.offset)
            self._pos_widgets()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging = False
            self._show_idle()
            self._apply_gravity()

    def _pos_widgets(self):
        bw = self.bubble.width()
        bx = self.pos().x() + self.width() // 2 - bw // 2
        by = self.pos().y() - self.bubble.height() - 5
        self.bubble.move(bx, by)

        ix = self.pos().x() + self.width() // 2 - 125
        iy = self.pos().y() + self.height() + 8
        self.input_box.move(ix, iy)

        ax = self.pos().x() + self.width() + 5
        ay = self.pos().y()
        self.affbar.move(ax, ay)

    def _apply_gravity(self):
        scr = QApplication.primaryScreen().geometry()
        x, y = self.pos().x(), self.pos().y()

        if x < 30:
            self._snap(0, y)
        elif x > scr.width() - self.width() - 30:
            self._snap(scr.width() - self.width(), y)
        elif y < scr.height() - self.height() - 80:
            self._fall(scr.height() - self.height() - 80)

    def _snap(self, tx, ty):
        anim = QPropertyAnimation(self, b"pos")
        anim.setDuration(300)
        anim.setStartValue(self.pos())
        anim.setEndValue(QPoint(tx, ty))
        anim.setEasingCurve(QEasingCurve.Type.OutBounce)
        anim.start()
        self._anim = anim

    def _fall(self, ty):
        anim = QPropertyAnimation(self, b"pos")
        anim.setDuration(250)
        anim.setStartValue(self.pos())
        anim.setEndValue(QPoint(self.pos().x(), ty))
        anim.setEasingCurve(QEasingCurve.Type.OutQuad)
        anim.start()
        self._anim = anim


def main():
    os.environ['QT_AUTO_SCREEN_SCALE_FACTOR'] = '1'
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    pet = AnimPet()
    pet.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
