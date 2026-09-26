import os
import sys
import json
import urllib.request
import urllib.error
import webbrowser
import threading
import tkinter as tk
from tkinter import ttk, messagebox

SERVER_BASE_URL = "http://localhost"
STATUS_API = f"{SERVER_BASE_URL}/api/training/status"
POLICIES_API = f"{SERVER_BASE_URL}/api/training/policies"
START_API = f"{SERVER_BASE_URL}/api/training/start"
STOP_API = f"{SERVER_BASE_URL}/api/training/stop"
ACTIVATE_API = f"{SERVER_BASE_URL}/api/training/activate"

class BattleFightTrainerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("BattleFight AI - Control Center & Live Stats")
        self.geometry("760x640")
        self.minsize(680, 560)
        self.configure(bg="#0f172a")

        # Styling
        self.style = ttk.Style(self)
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        self._init_styles()
        self._create_widgets()
        
        self.is_running_loop = True
        self.current_state = "unknown"
        
        # Start background polling thread
        self.after(500, self.poll_status)

    def _init_styles(self):
        self.style.configure(".", background="#0f172a", foreground="#f8fafc", font=("Segoe UI", 10))
        self.style.configure("TFrame", background="#0f172a")
        self.style.configure("Card.TFrame", background="#1e293b", relief="flat")
        self.style.configure("Stat.TFrame", background="#334155", relief="flat")
        
        self.style.configure("Header.TLabel", background="#0f172a", foreground="#38bdf8", font=("Segoe UI", 18, "bold"))
        self.style.configure("SubHeader.TLabel", background="#0f172a", foreground="#94a3b8", font=("Segoe UI", 9))
        
        self.style.configure("StatTitle.TLabel", background="#334155", foreground="#94a3b8", font=("Segoe UI", 8, "bold"))
        self.style.configure("StatVal.TLabel", background="#334155", foreground="#f8fafc", font=("Segoe UI", 13, "bold"))
        
        self.style.configure("Play.TButton", font=("Segoe UI", 11, "bold"), background="#10b981", foreground="#ffffff")
        self.style.configure("Start.TButton", font=("Segoe UI", 10, "bold"), background="#2563eb", foreground="#ffffff")
        self.style.configure("Stop.TButton", font=("Segoe UI", 10, "bold"), background="#ef4444", foreground="#ffffff")
        self.style.configure("Action.TButton", font=("Segoe UI", 9), background="#475569", foreground="#ffffff")

    def _create_widgets(self):
        # Header container
        header_frame = ttk.Frame(self)
        header_frame.pack(fill="x", padx=20, pady=(15, 10))

        title_box = ttk.Frame(header_frame)
        title_box.pack(side="left")
        ttk.Label(title_box, text="⚔️ BATTLEFIGHT AI CONTROL CENTER", style="Header.TLabel").pack(anchor="w")
        ttk.Label(title_box, text="ระบบมอนิเตอร์และควบคุมการฝึกฝน AI พร้อมเชื่อมต่อเข้าเล่นเกม", style="SubHeader.TLabel").pack(anchor="w")

        # Status badge
        self.badge_lbl = tk.Label(header_frame, text="CONNECTING...", font=("Segoe UI", 9, "bold"), bg="#475569", fg="#ffffff", padx=12, pady=5)
        self.badge_lbl.pack(side="right", pady=5)

        # Main Card for Stats
        card = ttk.Frame(self, style="Card.TFrame", padding=15)
        card.pack(fill="x", padx=20, pady=10)

        card_title_row = ttk.Frame(card, style="Card.TFrame")
        card_title_row.pack(fill="x", pady=(0, 10))
        ttk.Label(card_title_row, text="📊 สถิติการเทรนแบบเรียลไทม์ (Live Stats)", font=("Segoe UI", 12, "bold"), background="#1e293b", foreground="#38bdf8").pack(side="left")

        # Stats Grid (6 cards)
        stats_grid = ttk.Frame(card, style="Card.TFrame")
        stats_grid.pack(fill="x", expand=True)
        for i in range(3):
            stats_grid.columnconfigure(i, weight=1, uniform="col")

        # Stat 1: State & Phase
        self.s_state = self._add_stat_box(stats_grid, 0, 0, "สถานะการเทรน (STATE)", "STOPPED", "#38bdf8")
        # Stat 2: Active Server Policy
        self.s_server_pol = self._add_stat_box(stats_grid, 0, 1, "โมเดลเกม (SERVER MODEL)", "baseline", "#4ade80")
        # Stat 3: Win Rate
        self.s_winrate = self._add_stat_box(stats_grid, 0, 2, "WIN RATE ผู้ท้าชิง", "-", "#facc15")

        # Stat 4: Champ / Candidate
        self.s_versions = self._add_stat_box(stats_grid, 1, 0, "CHAMPION / CANDIDATE", "- / -", "#cbd5e1")
        # Stat 5: Matches Completed
        self.s_matches = self._add_stat_box(stats_grid, 1, 1, "แมตช์ที่เสร็จสิ้น", "0", "#cbd5e1")
        # Stat 6: Sim Speed
        self.s_speed = self._add_stat_box(stats_grid, 1, 2, "ความเร็วเร่งจำลอง", "1.0x", "#c084fc")

        # Quick Control Panel
        control_card = ttk.Frame(self, style="Card.TFrame", padding=15)
        control_card.pack(fill="x", padx=20, pady=10)
        
        ttk.Label(control_card, text="🎮 การควบคุมเซิร์ฟเวอร์ & AI", font=("Segoe UI", 12, "bold"), background="#1e293b", foreground="#38bdf8").pack(anchor="w", pady=(0, 10))

        ctrl_row1 = ttk.Frame(control_card, style="Card.TFrame")
        ctrl_row1.pack(fill="x", pady=5)

        self.btn_toggle_train = tk.Button(ctrl_row1, text="▶ เริ่มเทรน AI (Start Training)", font=("Segoe UI", 10, "bold"), bg="#2563eb", fg="#ffffff", activebackground="#1d4ed8", activeforeground="#ffffff", padx=12, pady=6, relief="flat", cursor="hand2", command=self.toggle_training)
        self.btn_toggle_train.pack(side="left", padx=(0, 10))

        # Model Selector
        sel_frame = ttk.Frame(ctrl_row1, style="Card.TFrame")
        sel_frame.pack(side="left", padx=10)
        ttk.Label(sel_frame, text="เลือกโมเดลเล่นในเกม:", font=("Segoe UI", 9, "bold"), background="#1e293b", foreground="#94a3b8").pack(side="left", padx=(0, 6))
        
        self.policy_var = tk.StringVar(value="latest")
        self.policy_combo = ttk.Combobox(sel_frame, textvariable=self.policy_var, state="readonly", width=16)
        self.policy_combo.pack(side="left", padx=(0, 6))
        self.policy_combo.bind("<<ComboboxSelected>>", self.on_policy_change)

        # Refresh button
        btn_refresh = tk.Button(ctrl_row1, text="🔄 รีเฟรช", font=("Segoe UI", 9), bg="#475569", fg="#ffffff", relief="flat", padx=10, pady=4, cursor="hand2", command=self.poll_status)
        btn_refresh.pack(side="right")

        # Play / Spectate Game Action
        play_card = ttk.Frame(self, style="Card.TFrame", padding=15)
        play_card.pack(fill="x", padx=20, pady=10)

        play_inner = ttk.Frame(play_card, style="Card.TFrame")
        play_inner.pack(fill="x")

        play_info = ttk.Frame(play_inner, style="Card.TFrame")
        play_info.pack(side="left")
        ttk.Label(play_info, text="🕹️ เข้าสู่เกมเพื่อทดสอบ", font=("Segoe UI", 12, "bold"), background="#1e293b", foreground="#38bdf8").pack(anchor="w")
        ttk.Label(play_info, text="เปิดเบราว์เซอร์เข้าเล่นโหมด 3v3 กับบอท หรือสลับดูกล้องการต่อสู้ (Spectate)", font=("Segoe UI", 9), background="#1e293b", foreground="#94a3b8").pack(anchor="w")

        btn_open_browser = tk.Button(play_inner, text="🌐 เปิดเกมในเบราว์เซอร์ (Open Game)", font=("Segoe UI", 11, "bold"), bg="#10b981", fg="#ffffff", activebackground="#059669", activeforeground="#ffffff", padx=16, pady=8, relief="flat", cursor="hand2", command=self.open_game_in_browser)
        btn_open_browser.pack(side="right", padx=5)

        # Logs / Console preview
        log_frame = ttk.Frame(self, style="Card.TFrame", padding=10)
        log_frame.pack(fill="both", expand=True, padx=20, pady=(5, 15))

        ttk.Label(log_frame, text="Activity Log", font=("Segoe UI", 9, "bold"), background="#1e293b", foreground="#64748b").pack(anchor="w", pady=(0, 4))
        
        self.log_text = tk.Text(log_frame, height=5, bg="#0b1120", fg="#38bdf8", font=("Consolas", 9), relief="flat", borderwidth=0, padx=8, pady=6)
        self.log_text.pack(fill="both", expand=True)
        self.log_text.insert("end", "[System] Application initialized. Waiting for server response...\n")
        self.log_text.configure(state="disabled")

    def _add_stat_box(self, parent, row, col, title, initial_val, color):
        box = ttk.Frame(parent, style="Stat.TFrame", padding=8)
        box.grid(row=row, column=col, padx=4, pady=4, sticky="nsew")
        
        ttk.Label(box, text=title, style="StatTitle.TLabel").pack(anchor="w")
        lbl = tk.Label(box, text=initial_val, font=("Segoe UI", 12, "bold"), bg="#334155", fg=color)
        lbl.pack(anchor="w", pady=(2, 0))
        return lbl

    def log(self, message):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"> {message}\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def open_game_in_browser(self):
        webbrowser.open(SERVER_BASE_URL)
        self.log(f"เปิดหน้าเกมที่ {SERVER_BASE_URL}")

    def poll_status(self):
        def worker():
            try:
                req = urllib.request.Request(STATUS_API)
                with urllib.request.urlopen(req, timeout=3) as res:
                    data = json.loads(res.read().decode())
                
                req2 = urllib.request.Request(POLICIES_API)
                with urllib.request.urlopen(req2, timeout=3) as res2:
                    pdata = json.loads(res2.read().decode())

                self.after(0, lambda: self._update_ui_data(data, pdata))
            except Exception as e:
                self.after(0, lambda: self._handle_poll_error(str(e)))

        threading.Thread(target=worker, daemon=True).start()
        # Schedule next poll every 2.5s
        if self.is_running_loop:
            self.after(2500, self.poll_status)

    def _update_ui_data(self, data, pdata):
        if not data.get("ok"):
            return
        
        train = data.get("training", {})
        reg = data.get("registry", {})
        state = train.get("state", "stopped")
        self.current_state = state
        phase = train.get("phase", "")
        
        # Badge
        if state == "running":
            self.badge_lbl.configure(text="● RUNNING", bg="#16a34a", fg="#ffffff")
            self.btn_toggle_train.configure(text="⏹ หยุดเทรน AI (Stop Training)", bg="#ef4444", activebackground="#dc2626")
        elif state == "stopping":
            self.badge_lbl.configure(text="⏳ STOPPING...", bg="#d97706", fg="#ffffff")
            self.btn_toggle_train.configure(text="⏳ กำลังหยุด...", bg="#64748b", activebackground="#64748b")
        else:
            self.badge_lbl.configure(text="○ STOPPED", bg="#475569", fg="#ffffff")
            self.btn_toggle_train.configure(text="▶ เริ่มเทรน AI (Start Training)", bg="#2563eb", activebackground="#1d4ed8")

        # Stats
        st_text = state.upper() + (f" ({phase})" if phase else "")
        self.s_state.configure(text=st_text)
        self.s_server_pol.configure(text=data.get("serverPolicy", "baseline"))
        
        champ = train.get("championVersion") or reg.get("championVersion") or "base"
        cand = train.get("candidateVersion") or "-"
        self.s_versions.configure(text=f"{champ}  vs  {cand}")

        wr = train.get("candidateValidationWinRate")
        if wr is not None:
            games = train.get("candidateValidationGames", 0)
            self.s_winrate.configure(text=f"{wr * 100:.1f}% ({games} games)")
        elif phase == "train":
            self.s_winrate.configure(text=f"{train.get('pendingDecisions', 0)} decisions")
        else:
            self.s_winrate.configure(text="-")

        comp = train.get("completed", 0)
        failed = train.get("failed", 0)
        self.s_matches.configure(text=f"{comp} (err: {failed})")

        speed = train.get("simulatedSecondsPerWallSecond", 0)
        smode = train.get("speedMode", "max")
        self.s_speed.configure(text=f"{speed:.1f}x ({smode})")

        # Policies Combobox
        if pdata.get("ok"):
            policies = pdata.get("policies", [])
            active = reg.get("activeVersion", "baseline")
            if tuple(policies) != self.policy_combo["values"]:
                self.policy_combo["values"] = policies
            if self.policy_var.get() != active:
                self.policy_var.set(active)

    def _handle_poll_error(self, err_msg):
        self.badge_lbl.configure(text="OFFLINE", bg="#dc2626", fg="#ffffff")
        self.s_state.configure(text="SERVER OFFLINE")

    def toggle_training(self):
        if self.current_state == "running":
            self.log("กำลังส่งคำสั่งหยุดเทรน (Stop)...")
            self.btn_toggle_train.configure(text="⏳ กำลังหยุด...", bg="#64748b")
            threading.Thread(target=self._api_post, args=(STOP_API, {}), daemon=True).start()
        else:
            self.log("กำลังส่งคำสั่งเริ่มเทรน AI (Start)...")
            self.btn_toggle_train.configure(text="⏳ กำลังเริ่ม...", bg="#64748b")
            body = {"workers": 2, "neural": True, "speed": "max"}
            threading.Thread(target=self._api_post, args=(START_API, body), daemon=True).start()

    def on_policy_change(self, event):
        val = self.policy_var.get()
        if not val:
            return
        self.log(f"เปลี่ยนโมเดลเล่นในเกมเป็น: {val}")
        threading.Thread(target=self._api_post, args=(ACTIVATE_API, {"version": val}), daemon=True).start()

    def _api_post(self, url, body_dict):
        try:
            data_bytes = json.dumps(body_dict).encode("utf-8")
            req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5) as res:
                resp = json.loads(res.read().decode())
                self.after(0, lambda: self.log(f"คำสั่งสำเร็จ: {resp}"))
        except Exception as e:
            self.after(0, lambda: self.log(f"คำสั่งผิดพลาด: {e}"))

if __name__ == "__main__":
    app = BattleFightTrainerApp()
    app.mainloop()
