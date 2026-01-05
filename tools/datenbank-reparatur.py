"""
Werkstatt-Terminplaner Datenbank-Reparatur Tool
Grafische Oberfläche zum Migrieren und Reparieren der Datenbank
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import sqlite3
import os
import shutil
from datetime import datetime
import threading
import urllib.request
import zipfile
import tempfile

class DatabaseRepairTool:
    def __init__(self, root):
        self.root = root
        self.root.title("Werkstatt-Terminplaner Datenbank-Reparatur")
        self.root.geometry("700x600")
        self.root.resizable(True, True)
        
        # Icon setzen (falls vorhanden)
        try:
            self.root.iconbitmap("icon.ico")
        except:
            pass
        
        self.db_path = tk.StringVar()
        self.setup_ui()
        self.find_database()
    
    def setup_ui(self):
        # Hauptframe
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Titel
        title_label = ttk.Label(main_frame, text="Datenbank-Reparatur Tool", font=("Segoe UI", 16, "bold"))
        title_label.pack(pady=(0, 10))
        
        # Datenbank-Auswahl Frame
        db_frame = ttk.LabelFrame(main_frame, text="Datenbank", padding="10")
        db_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(db_frame, text="Pfad:").pack(anchor=tk.W)
        
        path_frame = ttk.Frame(db_frame)
        path_frame.pack(fill=tk.X, pady=(5, 0))
        
        self.path_entry = ttk.Entry(path_frame, textvariable=self.db_path, width=60)
        self.path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        ttk.Button(path_frame, text="Durchsuchen...", command=self.browse_database).pack(side=tk.LEFT, padx=(5, 0))
        ttk.Button(path_frame, text="Auto-Suche", command=self.find_database).pack(side=tk.LEFT, padx=(5, 0))
        
        # Aktionen Frame
        action_frame = ttk.LabelFrame(main_frame, text="Aktionen", padding="10")
        action_frame.pack(fill=tk.X, pady=(0, 10))
        
        btn_frame = ttk.Frame(action_frame)
        btn_frame.pack(fill=tk.X)
        
        self.check_btn = ttk.Button(btn_frame, text="Datenbank pruefen", command=self.check_database)
        self.check_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.repair_btn = ttk.Button(btn_frame, text="Reparatur starten", command=self.start_repair)
        self.repair_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.backup_btn = ttk.Button(btn_frame, text="Backup erstellen", command=self.create_backup)
        self.backup_btn.pack(side=tk.LEFT)
        
        # Progress
        self.progress = ttk.Progressbar(action_frame, mode='determinate')
        self.progress.pack(fill=tk.X, pady=(10, 0))
        
        self.status_label = ttk.Label(action_frame, text="Bereit")
        self.status_label.pack(anchor=tk.W, pady=(5, 0))
        
        # Log Frame
        log_frame = ttk.LabelFrame(main_frame, text="Protokoll", padding="10")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, height=15, font=("Consolas", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # Tags fuer farbige Ausgabe
        self.log_text.tag_config("success", foreground="green")
        self.log_text.tag_config("error", foreground="red")
        self.log_text.tag_config("warning", foreground="orange")
        self.log_text.tag_config("info", foreground="blue")
        
        # Footer
        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Label(footer_frame, text="Werkstatt-Terminplaner v1.0", font=("Segoe UI", 8)).pack(side=tk.LEFT)
        ttk.Button(footer_frame, text="Schliessen", command=self.root.quit).pack(side=tk.RIGHT)
    
    def log(self, message, tag=None):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n", tag)
        self.log_text.see(tk.END)
        self.root.update_idletasks()
    
    def set_status(self, message):
        self.status_label.config(text=message)
        self.root.update_idletasks()
    
    def find_database(self):
        """Sucht automatisch nach der Datenbank"""
        self.log("Suche Datenbank...", "info")
        
        possible_paths = []
        
        # Temp-Ordner durchsuchen
        temp_dir = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp')
        if os.path.exists(temp_dir):
            for folder in os.listdir(temp_dir):
                folder_path = os.path.join(temp_dir, folder)
                if os.path.isdir(folder_path):
                    # asar-app-0 Ordner
                    db_path = os.path.join(folder_path, 'asar-app-0', 'database', 'werkstatt.db')
                    if os.path.exists(db_path):
                        possible_paths.append(db_path)
                    # Direkter database Ordner
                    db_path = os.path.join(folder_path, 'database', 'werkstatt.db')
                    if os.path.exists(db_path):
                        possible_paths.append(db_path)
        
        # AppData Roaming
        appdata = os.environ.get('APPDATA', '')
        db_path = os.path.join(appdata, 'Werkstatt Terminplaner', 'database', 'werkstatt.db')
        if os.path.exists(db_path):
            possible_paths.append(db_path)
        
        # Lokaler backend Ordner
        script_dir = os.path.dirname(os.path.abspath(__file__))
        for rel_path in ['backend/database/werkstatt.db', 'database/werkstatt.db', '../database/werkstatt.db']:
            db_path = os.path.join(script_dir, rel_path)
            if os.path.exists(db_path):
                possible_paths.append(os.path.abspath(db_path))
        
        if possible_paths:
            # Neueste Datei verwenden
            possible_paths.sort(key=lambda x: os.path.getmtime(x), reverse=True)
            self.db_path.set(possible_paths[0])
            self.log(f"Datenbank gefunden: {possible_paths[0]}", "success")
            if len(possible_paths) > 1:
                self.log(f"({len(possible_paths)} Datenbanken gefunden, neueste ausgewaehlt)", "info")
        else:
            self.log("Keine Datenbank automatisch gefunden", "warning")
    
    def browse_database(self):
        """Oeffnet Datei-Dialog zur Auswahl der Datenbank"""
        filename = filedialog.askopenfilename(
            title="Datenbank auswaehlen",
            filetypes=[("SQLite Datenbank", "*.db"), ("Alle Dateien", "*.*")]
        )
        if filename:
            self.db_path.set(filename)
            self.log(f"Datenbank ausgewaehlt: {filename}", "info")
    
    def get_existing_columns(self, cursor, table):
        """Gibt Liste der existierenden Spalten zurueck"""
        cursor.execute(f"PRAGMA table_info({table})")
        return [row[1] for row in cursor.fetchall()]
    
    def check_database(self):
        """Prueft die Datenbank auf fehlende Spalten"""
        db_path = self.db_path.get()
        if not db_path or not os.path.exists(db_path):
            messagebox.showerror("Fehler", "Bitte waehle eine gueltige Datenbank aus!")
            return
        
        self.log("=" * 50)
        self.log("Starte Datenbank-Pruefung...", "info")
        self.progress['value'] = 0
        
        # Erwartete Spalten
        expected_columns = {
            'termine': [
                'startzeit', 'endzeit_berechnet', 'kunde_name', 'kunde_telefon',
                'abholung_typ', 'abholung_details', 'abholung_zeit', 'bring_zeit',
                'kontakt_option', 'kilometerstand', 'ersatzauto', 'ersatzauto_tage',
                'ersatzauto_bis_datum', 'ersatzauto_bis_zeit', 'abholung_datum',
                'termin_nr', 'arbeitszeiten_details', 'mitarbeiter_id', 'geloescht_am',
                'dringlichkeit', 'vin', 'fahrzeugtyp', 'ist_schwebend', 'parent_termin_id',
                'split_teil', 'muss_bearbeitet_werden', 'erweiterung_von_id',
                'ist_erweiterung', 'erweiterung_typ', 'teile_status', 'interne_auftragsnummer'
            ],
            'kunden': ['vin', 'fahrzeugtyp'],
            'mitarbeiter': [
                'nebenzeit_prozent', 'ist_lehrling', 'lehrjahr',
                'mittagspause_start', 'mittagspause_dauer', 'reihenfolge'
            ]
        }
        
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            total_missing = 0
            total_existing = 0
            
            tables = list(expected_columns.keys())
            for i, table in enumerate(tables):
                self.progress['value'] = (i + 1) / len(tables) * 100
                self.set_status(f"Pruefe Tabelle: {table}")
                
                try:
                    existing = self.get_existing_columns(cursor, table)
                    self.log(f"\nTabelle '{table}' ({len(existing)} Spalten):")
                    
                    missing = []
                    for col in expected_columns[table]:
                        if col in existing:
                            total_existing += 1
                        else:
                            missing.append(col)
                            total_missing += 1
                    
                    if missing:
                        self.log(f"  Fehlende Spalten: {len(missing)}", "warning")
                        for col in missing:
                            self.log(f"    - {col}", "error")
                    else:
                        self.log(f"  Alle Spalten vorhanden", "success")
                        
                except sqlite3.OperationalError as e:
                    self.log(f"  Tabelle nicht gefunden!", "error")
            
            conn.close()
            
            self.log("\n" + "=" * 50)
            if total_missing > 0:
                self.log(f"ERGEBNIS: {total_missing} fehlende Spalten gefunden!", "error")
                self.log("Bitte fuehre die Reparatur durch.", "warning")
            else:
                self.log(f"ERGEBNIS: Alle {total_existing} Spalten vorhanden!", "success")
                self.log("Keine Reparatur erforderlich.", "success")
            
            self.set_status(f"Pruefung abgeschlossen - {total_missing} fehlende Spalten")
            self.progress['value'] = 100
            
        except Exception as e:
            self.log(f"Fehler beim Pruefen: {str(e)}", "error")
            self.set_status("Fehler bei der Pruefung")
    
    def create_backup(self):
        """Erstellt ein Backup der Datenbank"""
        db_path = self.db_path.get()
        if not db_path or not os.path.exists(db_path):
            messagebox.showerror("Fehler", "Bitte waehle eine gueltige Datenbank aus!")
            return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.backup_{timestamp}.db"
        
        try:
            shutil.copy2(db_path, backup_path)
            self.log(f"Backup erstellt: {backup_path}", "success")
            messagebox.showinfo("Backup", f"Backup erfolgreich erstellt:\n{backup_path}")
        except Exception as e:
            self.log(f"Backup-Fehler: {str(e)}", "error")
            messagebox.showerror("Fehler", f"Backup fehlgeschlagen:\n{str(e)}")
    
    def start_repair(self):
        """Startet die Reparatur in einem separaten Thread"""
        db_path = self.db_path.get()
        if not db_path or not os.path.exists(db_path):
            messagebox.showerror("Fehler", "Bitte waehle eine gueltige Datenbank aus!")
            return
        
        if messagebox.askyesno("Bestaetigung", 
            "Moechtest du die Datenbank-Reparatur starten?\n\n"
            "Es wird automatisch ein Backup erstellt."):
            
            # Buttons deaktivieren
            self.check_btn.config(state=tk.DISABLED)
            self.repair_btn.config(state=tk.DISABLED)
            self.backup_btn.config(state=tk.DISABLED)
            
            # Reparatur in Thread starten
            thread = threading.Thread(target=self.repair_database)
            thread.start()
    
    def repair_database(self):
        """Fuehrt die Datenbank-Reparatur durch"""
        db_path = self.db_path.get()
        
        self.log("=" * 50)
        self.log("Starte Datenbank-Reparatur...", "info")
        self.progress['value'] = 0
        
        # Backup erstellen
        self.set_status("Erstelle Backup...")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.backup_{timestamp}.db"
        try:
            shutil.copy2(db_path, backup_path)
            self.log(f"Backup erstellt: {backup_path}", "success")
        except Exception as e:
            self.log(f"Backup-Fehler: {str(e)}", "error")
            self.enable_buttons()
            return
        
        self.progress['value'] = 10
        
        # Spalten-Definitionen
        columns_to_add = {
            'termine': [
                ('startzeit', 'TEXT'),
                ('endzeit_berechnet', 'TEXT'),
                ('kunde_name', 'TEXT'),
                ('kunde_telefon', 'TEXT'),
                ('abholung_typ', 'TEXT'),
                ('abholung_details', 'TEXT'),
                ('abholung_zeit', 'TEXT'),
                ('bring_zeit', 'TEXT'),
                ('kontakt_option', 'TEXT'),
                ('kilometerstand', 'INTEGER'),
                ('ersatzauto', 'INTEGER'),
                ('ersatzauto_tage', 'INTEGER'),
                ('ersatzauto_bis_datum', 'DATE'),
                ('ersatzauto_bis_zeit', 'TEXT'),
                ('abholung_datum', 'DATE'),
                ('termin_nr', 'TEXT'),
                ('arbeitszeiten_details', 'TEXT'),
                ('mitarbeiter_id', 'INTEGER'),
                ('geloescht_am', 'DATETIME'),
                ('dringlichkeit', 'TEXT'),
                ('vin', 'TEXT'),
                ('fahrzeugtyp', 'TEXT'),
                ('ist_schwebend', 'INTEGER'),
                ('parent_termin_id', 'INTEGER'),
                ('split_teil', 'INTEGER'),
                ('muss_bearbeitet_werden', 'INTEGER'),
                ('erweiterung_von_id', 'INTEGER'),
                ('ist_erweiterung', 'INTEGER'),
                ('erweiterung_typ', 'TEXT'),
                ('teile_status', 'TEXT'),
                ('interne_auftragsnummer', 'TEXT'),
            ],
            'kunden': [
                ('vin', 'TEXT'),
                ('fahrzeugtyp', 'TEXT'),
            ],
            'mitarbeiter': [
                ('nebenzeit_prozent', 'REAL'),
                ('ist_lehrling', 'INTEGER'),
                ('lehrjahr', 'INTEGER'),
                ('mittagspause_start', 'TEXT'),
                ('mittagspause_dauer', 'INTEGER'),
                ('reihenfolge', 'INTEGER'),
            ]
        }
        
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            added_count = 0
            skipped_count = 0
            error_count = 0
            
            total_columns = sum(len(cols) for cols in columns_to_add.values())
            current = 0
            
            for table, columns in columns_to_add.items():
                self.log(f"\nTabelle '{table}':")
                
                # Existierende Spalten holen
                try:
                    existing = self.get_existing_columns(cursor, table)
                except:
                    self.log(f"  Tabelle nicht gefunden - uebersprungen", "warning")
                    current += len(columns)
                    continue
                
                for col_name, col_type in columns:
                    current += 1
                    self.progress['value'] = 10 + (current / total_columns * 85)
                    self.set_status(f"Verarbeite: {table}.{col_name}")
                    
                    if col_name in existing:
                        self.log(f"  {col_name}: existiert bereits", "info")
                        skipped_count += 1
                    else:
                        try:
                            sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                            cursor.execute(sql)
                            self.log(f"  {col_name}: HINZUGEFUEGT", "success")
                            added_count += 1
                        except Exception as e:
                            self.log(f"  {col_name}: FEHLER - {str(e)}", "error")
                            error_count += 1
            
            conn.commit()
            conn.close()
            
            self.progress['value'] = 100
            self.log("\n" + "=" * 50)
            self.log("REPARATUR ABGESCHLOSSEN!", "success")
            self.log(f"  Hinzugefuegt: {added_count} Spalten", "success")
            self.log(f"  Uebersprungen: {skipped_count} Spalten", "info")
            if error_count > 0:
                self.log(f"  Fehler: {error_count}", "error")
            
            self.set_status(f"Abgeschlossen - {added_count} Spalten hinzugefuegt")
            
            self.root.after(0, lambda: messagebox.showinfo("Fertig", 
                f"Reparatur abgeschlossen!\n\n"
                f"Hinzugefuegt: {added_count} Spalten\n"
                f"Uebersprungen: {skipped_count} Spalten\n"
                f"Fehler: {error_count}\n\n"
                f"Bitte starte die App neu."))
            
        except Exception as e:
            self.log(f"Fehler: {str(e)}", "error")
            self.set_status("Fehler bei der Reparatur")
            self.root.after(0, lambda: messagebox.showerror("Fehler", f"Reparatur fehlgeschlagen:\n{str(e)}"))
        
        self.enable_buttons()
    
    def enable_buttons(self):
        """Aktiviert die Buttons wieder"""
        self.root.after(0, lambda: self.check_btn.config(state=tk.NORMAL))
        self.root.after(0, lambda: self.repair_btn.config(state=tk.NORMAL))
        self.root.after(0, lambda: self.backup_btn.config(state=tk.NORMAL))


def main():
    root = tk.Tk()
    app = DatabaseRepairTool(root)
    root.mainloop()


if __name__ == "__main__":
    main()
