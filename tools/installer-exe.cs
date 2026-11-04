using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using Microsoft.Win32;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("EVO Pitwall Setup")]
[assembly: System.Reflection.AssemblyDescription("Installazione guidata di EVO Pitwall")]
[assembly: System.Reflection.AssemblyCompany("EVO Pitwall")]
[assembly: System.Reflection.AssemblyProduct("EVO Pitwall")]
[assembly: System.Reflection.AssemblyVersion("__VERSION__")]
[assembly: System.Reflection.AssemblyFileVersion("__VERSION__")]

namespace EvoPitwallSetup
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            string dir = null;
            bool silent = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (String.Equals(args[i], "--silent", StringComparison.OrdinalIgnoreCase)) silent = true;
                else if (String.Equals(args[i], "--dir", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length) dir = args[++i];
            }

            if (silent)
            {
                if (String.IsNullOrWhiteSpace(dir)) dir = DefaultDirectory();
                string log = Path.Combine(Path.GetTempPath(), "EVO-Pitwall-Setup-silent.log");
                try { File.WriteAllText(log, ""); } catch { }
                int code = Installer.Run(dir, true, true, false, delegate(string line) { AppendLog(log, line); });
                Environment.ExitCode = code;
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }

        internal static string DefaultDirectory()
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (String.IsNullOrWhiteSpace(home)) home = Environment.GetFolderPath(Environment.SpecialFolder.Personal);
            return Path.Combine(home, "EVO-Pitwall");
        }

        private static void AppendLog(string file, string line)
        {
            try
            {
                lock (typeof(Program))
                {
                    File.AppendAllText(file, line + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }
    }

    internal static class LoaderMod
    {
        // Sorgente ufficiale della mod: release GitHub (nessuna pagina di
        // download che cambia nel tempo) e pagina OverTake citata nella guida.
        internal const string DownloadUrl = "https://github.com/dreasgrech/ACEUIAppLoader/releases/latest";

        internal static string[] Roots()
        {
            // Stesso override di src/paths.mjs: chi sposta Saved Games (o i
            // test) comanda con ACE_SAVEDIR.
            string overrideDir = Environment.GetEnvironmentVariable("ACE_SAVEDIR");
            if (!String.IsNullOrWhiteSpace(overrideDir)) return new string[] { overrideDir.Trim() };

            string[] list = new string[2];
            int count = 0;
            try
            {
                object value = Registry.GetValue(
                    @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
                    "{4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4}", null);
                string registryPath = value as string;
                if (!String.IsNullOrWhiteSpace(registryPath))
                {
                    registryPath = Environment.ExpandEnvironmentVariables(registryPath.Trim());
                    if (Directory.Exists(registryPath)) list[count++] = registryPath;
                }
            }
            catch { }

            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string fallback = Path.Combine(home, "Saved Games");
            if (Directory.Exists(fallback) && (count == 0 || !String.Equals(list[0], fallback, StringComparison.OrdinalIgnoreCase)))
                list[count++] = fallback;
            if (count == 0) list[count++] = fallback;

            string[] result = new string[count];
            Array.Copy(list, result, count);
            return result;
        }

        internal static string InstalledAt(string root)
        {
            if (String.IsNullOrWhiteSpace(root)) return null;
            string path = Path.Combine(root, "ACE", "mods", "uiresources", "ACEUIAppLoader");
            return Directory.Exists(path) ? path : null;
        }

        internal static string Installed()
        {
            foreach (string root in Roots())
            {
                string path = InstalledAt(root);
                if (path != null) return path;
            }
            return null;
        }

        internal static string Expected()
        {
            return Path.Combine(Roots()[0], "ACE", "mods", "uiresources", "ACEUIAppLoader");
        }

        internal static bool Present
        {
            get { return Installed() != null; }
        }
    }

    internal static class Installer
    {
        // Inserito dal builder: è l'installer testato del progetto, non una copia
        // parallela della logica. Il file viene estratto in TEMP e lanciato da lì.
        private const string ScriptB64 = "__SCRIPT_B64__";

        // true solo nella variante offline: node.zip e code.zip sono incorporati
        // nell'EXE e la GUI non deve mai ripiegare su un download.
        internal const bool Offline = __OFFLINE__;

        // Versione, commit e variante, iniettati dal builder: sono la prima cosa
        // da chiedere a chi segnala un problema ("quale EXE stai usando?").
        internal const string Build = "__BUILD__";

        internal static int Run(string target, bool fast, bool noShortcut, bool launch, Action<string> log)
        {
            string temp = Path.Combine(Path.GetTempPath(), "EVO-Pitwall-Setup-" + Guid.NewGuid().ToString("N"));
            try
            {
                target = Path.GetFullPath(target);
                Write(log, "EVO Pitwall installer " + Build + " — cartella: " + target);
                if (!LoaderMod.Present)
                {
                    Write(log, "[i] Mod ACE UI App Loader assente: Cruscotto e Pitwall non compariranno nel menu di EVO.");
                    Write(log, "    Cartella attesa: " + LoaderMod.Expected());
                    Write(log, "    Download e istruzioni: " + LoaderMod.DownloadUrl + " — il resto funziona lo stesso.");
                }
                Directory.CreateDirectory(temp);
                string script = Path.Combine(temp, "installa.cmd");
                File.WriteAllBytes(script, Convert.FromBase64String(ScriptB64));
                string nodeZip = ExtractPayload("node.zip", temp);
                string codeZip = ExtractPayload("code.zip", temp);
                if (Offline && (nodeZip == null || codeZip == null))
                {
                    Write(log, "[!] Installer offline incompleto: pacchetti incorporati non trovati.");
                    return 1;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
                psi.Arguments = "/d /c call \"" + script + "\"";
                psi.WorkingDirectory = temp;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                Encoding consoleEncoding = Encoding.Default;
                try { consoleEncoding = Encoding.GetEncoding(850); } catch { }
                psi.StandardOutputEncoding = consoleEncoding;
                psi.StandardErrorEncoding = consoleEncoding;

                // L'installer batch riceve già tutte le risposte: la GUI non fa
                // domande in console. Il token non serve finché il repo è pubblico.
                psi.EnvironmentVariables["EVO_INSTALLER_DIR"] = target;
                psi.EnvironmentVariables["EVO_INSTALLER_AUTO"] = "1";
                psi.EnvironmentVariables["EVO_INSTALLER_NOAVVIO"] = "1";
                psi.EnvironmentVariables.Remove("EVO_INSTALLER_FAST");
                psi.EnvironmentVariables.Remove("EVO_INSTALLER_NOSCORCIATOIA");
                if (fast) psi.EnvironmentVariables["EVO_INSTALLER_FAST"] = "1";
                if (noShortcut) psi.EnvironmentVariables["EVO_INSTALLER_NOSCORCIATOIA"] = "1";
                if (nodeZip != null) psi.EnvironmentVariables["EVO_INSTALLER_NODEZIP"] = nodeZip;
                if (codeZip != null) psi.EnvironmentVariables["EVO_INSTALLER_CODEZIP"] = codeZip;

                using (Process p = new Process())
                {
                    p.StartInfo = psi;
                    p.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) Write(log, e.Data);
                    };
                    p.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) Write(log, e.Data);
                    };
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();
                    int code = p.ExitCode;
                    p.WaitForExit(1000);
                    if (code == 0 && launch)
                    {
                        string avvia = Path.Combine(target, "avvia.cmd");
                        if (File.Exists(avvia))
                        {
                            Process.Start(new ProcessStartInfo(avvia) { UseShellExecute = true, WorkingDirectory = target });
                        }
                        else
                        {
                            Write(log, "[!] Installazione completata, ma avvia.cmd non è stato trovato.");
                            code = 2;
                        }
                    }
                    return code;
                }
            }
            catch (Exception ex)
            {
                Write(log, "[!] " + ex.Message);
                return 1;
            }
            finally
            {
                try { Directory.Delete(temp, true); } catch { }
            }
        }

        private static void Write(Action<string> log, string line)
        {
            try { if (log != null) log(line); } catch { }
        }

        private static string ExtractPayload(string name, string dir)
        {
            try
            {
                using (Stream stream = typeof(Installer).Assembly.GetManifestResourceStream(name))
                {
                    if (stream == null) return null;
                    string path = Path.Combine(dir, name);
                    using (FileStream output = File.Create(path))
                    {
                        stream.CopyTo(output);
                    }
                    return path;
                }
            }
            catch
            {
                return null;
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly TextBox _path = new TextBox();
        private readonly Button _browse = new Button();
        private readonly Button _install = new Button();
        private readonly Button _uninstall = new Button();
        private readonly Button _copyLog = new Button();
        private readonly CheckBox _shortcut = new CheckBox();
        private readonly CheckBox _tests = new CheckBox();
        private readonly CheckBox _launch = new CheckBox();
        private readonly TextBox _log = new TextBox();
        private readonly Label _status = new Label();
        private readonly ProgressBar _bar = new ProgressBar();
        private bool _busy;

        internal SetupForm()
        {
            Text = "EVO Pitwall — Installazione";
            ClientSize = new Size(760, 580);
            MinimumSize = new Size(660, 540);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9F);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;

            Label title = new Label();
            title.Text = "EVO Pitwall";
            title.Font = new Font("Segoe UI", 20F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(20, 14);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = Installer.Offline
                ? "Installa la carriera senza internet: Node e codice sono gia' dentro questo file."
                : "Installa la carriera su questo PC. Non serve Git, non serve il terminale: Node viene scaricato solo se manca.";
            subtitle.AutoSize = true;
            subtitle.ForeColor = Color.FromArgb(80, 80, 80);
            subtitle.Location = new Point(23, 58);
            Controls.Add(subtitle);

            // Se la mod delle app in gioco manca, l'avviso arriva subito e
            // dice anche dove prenderla: il resto dell'installazione non
            // dipende da lei, quindi si va avanti senza bloccare nulla.
            bool avvisoLoader = !LoaderMod.Present;
            int spostamento = avvisoLoader ? 66 : 0;
            if (avvisoLoader)
            {
                Panel loaderPanel = new Panel();
                loaderPanel.Location = new Point(20, 80);
                loaderPanel.Size = new Size(720, 78);
                loaderPanel.BackColor = Color.FromArgb(255, 247, 214);
                loaderPanel.BorderStyle = BorderStyle.FixedSingle;
                loaderPanel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
                Controls.Add(loaderPanel);

                Label loaderText = new Label();
                loaderText.AutoSize = false;
                loaderText.Location = new Point(8, 5);
                loaderText.Size = new Size(566, 66);
                loaderText.Font = new Font("Segoe UI", 8.25F);
                loaderText.ForeColor = Color.FromArgb(120, 70, 0);
                loaderText.Text =
                    "Manca la mod «ACE UI App Loader»: senza, Cruscotto e Pitwall non compaiono in EVO.\r\n" +
                    "Tutto il resto funziona lo stesso. Cartella attesa:\r\n" +
                    LoaderMod.Expected() + "\r\n" +
                    "Download: github.com/dreasgrech/ACEUIAppLoader (o OverTake → ACE Apps).\r\n" +
                    "Estrai «mods» in Saved Games\\ACE e unisci. Vedi «Istruzioni».";
                loaderPanel.Controls.Add(loaderText);

                Button loaderPage = new Button();
                loaderPage.Text = "Apri pagina";
                loaderPage.Location = new Point(606, 8);
                loaderPage.Size = new Size(100, 28);
                loaderPage.Anchor = AnchorStyles.Top | AnchorStyles.Right;
                loaderPage.Click += LoaderPageClick;
                loaderPanel.Controls.Add(loaderPage);

                Button loaderHelp = new Button();
                loaderHelp.Text = "Istruzioni";
                loaderHelp.Location = new Point(606, 40);
                loaderHelp.Size = new Size(100, 28);
                loaderHelp.Anchor = AnchorStyles.Top | AnchorStyles.Right;
                loaderHelp.Click += LoaderHelpClick;
                loaderPanel.Controls.Add(loaderHelp);

                // Sotto i 760 la colonna di testo si stringe e le righe si
                // accavallano: l'avviso resta leggibile, la finestra no.
                MinimumSize = new Size(760, 540);
            }

            Label build = new Label();
            build.Text = Installer.Build;
            build.AutoSize = true;
            build.ForeColor = Color.FromArgb(110, 110, 110);
            // Larghezza misurata, bordo destro fisso: niente testo tagliato se
            // la build è lunga ("+mod") o la finestra si allarga.
            build.Location = new Point(ClientSize.Width - 20 - build.PreferredWidth, 30);
            build.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            Controls.Add(build);

            Label pathLabel = new Label();
            pathLabel.Text = "Cartella di installazione";
            pathLabel.AutoSize = true;
            pathLabel.Location = new Point(20, 102 + spostamento);
            Controls.Add(pathLabel);

            _path.Text = Program.DefaultDirectory();
            _path.Location = new Point(20, 123 + spostamento);
            _path.Width = 600;
            _path.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(_path);

            _browse.Text = "Sfoglia…";
            _browse.Location = new Point(630, 121 + spostamento);
            _browse.Width = 110;
            _browse.Height = 26;
            _browse.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            _browse.Click += BrowseClick;
            Controls.Add(_browse);

            _shortcut.Text = "Crea la scorciatoia «Carriera EVO» sul Desktop";
            _shortcut.Checked = true;
            _shortcut.AutoSize = true;
            _shortcut.Location = new Point(20, 164 + spostamento);
            Controls.Add(_shortcut);

            _tests.Text = "Esegui i test di installazione (più lento)";
            _tests.AutoSize = true;
            _tests.Location = new Point(20, 188 + spostamento);
            Controls.Add(_tests);

            _launch.Text = "Avvia EVO Pitwall al termine";
            _launch.Checked = true;
            _launch.AutoSize = true;
            _launch.Location = new Point(20, 212 + spostamento);
            Controls.Add(_launch);

            _install.Text = "Installa";
            _install.Location = new Point(20, 248 + spostamento);
            _install.Width = 150;
            _install.Height = 34;
            _install.Click += InstallClick;
            Controls.Add(_install);

            _status.Text = "Pronto per l'installazione.";
            _status.AutoSize = true;
            _uninstall.Text = "Disinstalla…";
            _uninstall.Location = new Point(180, 248 + spostamento);
            _uninstall.Width = 150;
            _uninstall.Height = 34;
            _uninstall.Click += UninstallClick;
            Controls.Add(_uninstall);

            _status.Location = new Point(350, 257 + spostamento);
            _status.ForeColor = Color.FromArgb(60, 60, 60);
            Controls.Add(_status);

            Label logLabel = new Label();
            logLabel.Text = "Attività";
            logLabel.AutoSize = true;
            logLabel.Location = new Point(20, 296 + spostamento);
            Controls.Add(logLabel);

            _copyLog.Text = "Copia log";
            _copyLog.Location = new Point(640, 288 + spostamento);
            _copyLog.Width = 100;
            _copyLog.Height = 26;
            _copyLog.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            _copyLog.Click += CopyLogClick;
            Controls.Add(_copyLog);

            _log.Multiline = true;
            _log.ReadOnly = true;
            _log.ScrollBars = ScrollBars.Vertical;
            _log.Location = new Point(20, 317 + spostamento);
            _log.Size = new Size(720, 214 - spostamento);
            _log.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            _log.BackColor = Color.White;
            _log.Font = new Font("Consolas", 8.5F);
            Controls.Add(_log);

            _bar.Location = new Point(20, 542);
            _bar.Width = 720;
            _bar.Height = 18;
            _bar.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            _bar.Style = ProgressBarStyle.Blocks;
            Controls.Add(_bar);

            AcceptButton = _install;
            FormClosing += ClosingCheck;
        }

        private void UninstallClick(object sender, EventArgs e)
        {
            if (_busy) return;
            string target;
            try { target = Path.GetFullPath(_path.Text.Trim()); }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Cartella non valida:\n" + ex.Message, "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string script = Path.Combine(target, "disinstalla.cmd");
            if (!File.Exists(script))
            {
                MessageBox.Show(this, "In questa cartella non trovo disinstalla.cmd.\nScegli la cartella di un'installazione EVO Pitwall.", "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (MessageBox.Show(this, "Avviare la disinstallazione di EVO Pitwall?\nLa finestra Console chiederà cosa fare della carriera.", "EVO Pitwall", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
                psi.Arguments = "/d /c call \"" + script + "\"";
                psi.WorkingDirectory = target;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = false;
                psi.EnvironmentVariables["EVO_DISINSTALLA_DIR"] = target;
                Process.Start(psi);
                _status.Text = "Disinstallazione avviata nella finestra Console.";
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non riesco ad avviare la disinstallazione:\n" + ex.Message, "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void CopyLogClick(object sender, EventArgs e)
        {
            // La build viaggia sempre col log: chi lo incolla non deve spiegare
            // quale EXE sta usando. Il testo resta negli appunti, niente file.
            string text = "EVO Pitwall installer " + Installer.Build + Environment.NewLine + _log.Text;
            try
            {
                Clipboard.SetText(text);
                _status.Text = "Log copiato negli appunti.";
            }
            catch (Exception ex)
            {
                _status.Text = "Copia non riuscita.";
                MessageBox.Show(this, "Non riesco a copiare il log:\n" + ex.Message, "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void LoaderPageClick(object sender, EventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo(LoaderMod.DownloadUrl) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non riesco ad aprire il browser:\n" + ex.Message + "\n\nScarica da:\n" + LoaderMod.DownloadUrl, "ACE UI App Loader", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void LoaderHelpClick(object sender, EventArgs e)
        {
            string text =
                "La mod «ACE UI App Loader» serve a far comparire Cruscotto e Pitwall nel menu di EVO." + Environment.NewLine + Environment.NewLine +
                "1. Scarica ACEUIAppLoader-….zip (quello senza «alternate») da:" + Environment.NewLine +
                "   " + LoaderMod.DownloadUrl + Environment.NewLine +
                "   oppure da OverTake → ACE Apps." + Environment.NewLine + Environment.NewLine +
                "2. Apri lo zip: dentro c'è una cartella «mods»." + Environment.NewLine + Environment.NewLine +
                "3. Premi Win+R, incolla %USERPROFILE%\\Saved Games\\ACE e premi Invio." + Environment.NewLine + Environment.NewLine +
                "4. Trascina la cartella «mods» nella finestra e scegli «Unisci» se chiede." + Environment.NewLine + Environment.NewLine +
                "5. Riapri il launcher e riavvia EVO: le app sono nel cassetto APPS." + Environment.NewLine + Environment.NewLine +
                "Cartella attesa:" + Environment.NewLine + LoaderMod.Expected() + Environment.NewLine + Environment.NewLine +
                "Senza la mod il resto funziona lo stesso: GUI, carriera e preparazione gare.";
            MessageBox.Show(this, text, "Installare ACE UI App Loader", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void BrowseClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dlg = new FolderBrowserDialog())
            {
                dlg.Description = "Scegli dove installare EVO Pitwall";
                dlg.ShowNewFolderButton = true;
                try { dlg.SelectedPath = _path.Text; } catch { }
                if (dlg.ShowDialog(this) == DialogResult.OK) _path.Text = dlg.SelectedPath;
            }
        }

        private void InstallClick(object sender, EventArgs e)
        {
            if (_busy) return;
            string target = _path.Text.Trim();
            if (target.Length == 0)
            {
                MessageBox.Show(this, "Scegli una cartella di installazione.", "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            try { target = Path.GetFullPath(target); }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Cartella non valida:\n" + ex.Message, "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (Directory.Exists(target))
            {
                string[] entries = Directory.GetFileSystemEntries(target);
                if (entries.Length > 0 && !File.Exists(Path.Combine(target, "ac-evo-career.mjs")))
                {
                    DialogResult r = MessageBox.Show(this,
                        "La cartella non è vuota e non sembra un'installazione di EVO Pitwall.\nContinuare? I file esistenti potrebbero essere sovrascritti.",
                        "Cartella non vuota", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                    if (r != DialogResult.Yes) return;
                }
            }
            _path.Text = target;
            SetBusy(true);
            _log.Clear();
            _status.Text = "Installazione in corso…";
            bool fast = !_tests.Checked;
            bool noShortcut = !_shortcut.Checked;
            bool launch = _launch.Checked;
            Thread t = new Thread(delegate()
            {
                int code = Installer.Run(target, fast, noShortcut, launch, Append);
                Finish(code);
            });
            t.IsBackground = true;
            t.Start();
        }

        private void Append(string line)
        {
            if (IsDisposed) return;
            try
            {
                BeginInvoke(new Action<string>(AppendNow), new object[] { line });
            }
            catch { }
        }

        private void AppendNow(string line)
        {
            if (IsDisposed) return;
            _log.AppendText(line + Environment.NewLine);
        }

        private void Finish(int code)
        {
            if (IsDisposed) return;
            try
            {
                BeginInvoke(new Action<int>(FinishNow), new object[] { code });
            }
            catch { }
        }

        private void FinishNow(int code)
        {
            SetBusy(false);
            if (code == 0)
            {
                _status.Text = "Installazione completata.";
                MessageBox.Show(this, "EVO Pitwall è installato.\nPuoi avviarlo dalla scorciatoia «Carriera EVO» o da avvia.cmd.", "Installazione completata", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                _status.Text = "Installazione non completata (codice " + code + ").";
                MessageBox.Show(this, "L'installazione non è stata completata.\nGuarda il riquadro Attività per il dettaglio.", "EVO Pitwall", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void SetBusy(bool busy)
        {
            _busy = busy;
            _path.Enabled = !busy;
            _browse.Enabled = !busy;
            _install.Enabled = !busy;
            _uninstall.Enabled = !busy;
            _shortcut.Enabled = !busy;
            _tests.Enabled = !busy;
            _launch.Enabled = !busy;
            _bar.Style = busy ? ProgressBarStyle.Marquee : ProgressBarStyle.Blocks;
            _bar.MarqueeAnimationSpeed = busy ? 30 : 0;
        }

        private void ClosingCheck(object sender, FormClosingEventArgs e)
        {
            if (!_busy) return;
            if (MessageBox.Show(this, "L'installazione è ancora in corso. Chiudere comunque?", "EVO Pitwall", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            {
                e.Cancel = true;
            }
        }
    }
}
