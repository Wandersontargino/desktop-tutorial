using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace EleitoralPara {
    // Authentication, downloads and the protected offline copy remain in the
    // user's regular browser profile. No credentials or voter data are bundled.
    internal static class LaunchPolicy {
        internal const string Origin = "https://analise-eleitoral-pa.wanderson-targino.chatgpt.site";
        internal static string Destination(string option) {
            switch (option) {
                case "": case "--browser": return Origin + "/";
                case "--quality": return Origin + "/#/cadastros/qualidade";
                case "--archives": return Origin + "/#/cadastros/arquivados";
                case "--health": return Origin + "/#/gestao/saude";
                default: throw new ArgumentException("Opção desconhecida. Use o atalho instalado da plataforma.");
            }
        }
        internal static bool Trusted(string value) {
            Uri uri;
            return Uri.TryCreate(value, UriKind.Absolute, out uri)
                && uri.Scheme == "https" && uri.Host == new Uri(Origin).Host
                && uri.Port == 443 && uri.UserInfo == "" && uri.Query == ""
                && uri.AbsolutePath == "/"
                && (uri.Fragment == "" || uri.Fragment == "#/cadastros/qualidade"
                    || uri.Fragment == "#/cadastros/arquivados" || uri.Fragment == "#/gestao/saude");
        }
        internal static string DefaultBrowserId() {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice"))
                return key == null ? "" : Convert.ToString(key.GetValue("ProgId", ""));
        }
        internal static string BrowserExecutable(string kind) {
            string[] roots = {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            };
            string tail = kind == "edge" ? @"Microsoft\Edge\Application\msedge.exe" : @"Google\Chrome\Application\chrome.exe";
            foreach (string root in roots) {
                if (String.IsNullOrEmpty(root)) continue;
                string path = Path.Combine(root, tail);
                if (File.Exists(path)) return path;
            }
            return null;
        }
        internal static string BrowserKind(string id) {
            if (id.StartsWith("MSEdge", StringComparison.OrdinalIgnoreCase)) return "edge";
            if (id.StartsWith("Chrome", StringComparison.OrdinalIgnoreCase)) return "chrome";
            return null;
        }
    }
    internal static class Program {
        [STAThread]
        private static int Main(string[] args) {
            Application.EnableVisualStyles();
            try {
                if (args.Length == 1 && args[0] == "--self-test") return SelfTest();
                if (args.Length == 1 && args[0] == "--about") {
                    MessageBox.Show("Eleitoral Pará " + Assembly.GetExecutingAssembly().GetName().Version.ToString(3)
                        + "\n\nAplicativo conectado à plataforma privada. Use sua conta autorizada e a senha da base."
                        + "\n\nA primeira abertura e a sincronização exigem internet. Prepare o uso offline dentro da plataforma, no mesmo navegador e perfil."
                        + "\n\nQualidade, duplicidades, arquivados, relatórios e backups usam a mesma base central.",
                        "Eleitoral Pará", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                if (args.Length > 1) throw new ArgumentException("Use o atalho instalado da plataforma.");
                string option = args.Length == 0 ? "" : args[0];
                string url = LaunchPolicy.Destination(option);
                if (!LaunchPolicy.Trusted(url)) throw new InvalidOperationException("Endereço de abertura inválido.");
                if (option != "--browser") {
                    string id = LaunchPolicy.DefaultBrowserId(), kind = LaunchPolicy.BrowserKind(id);
                    // Preserve the default browser's account and storage. When
                    // no choice exists yet, prefer the installed Windows Edge.
                    if (kind == null && String.IsNullOrEmpty(id)) kind = "edge";
                    string executable = kind == null ? null : LaunchPolicy.BrowserExecutable(kind);
                    if (executable != null) {
                        try {
                            Process.Start(new ProcessStartInfo(executable, "--app=\"" + url + "\"") { UseShellExecute = false });
                            return 0;
                        } catch (System.ComponentModel.Win32Exception) { }
                    }
                }
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                return 0;
            } catch (Exception error) {
                MessageBox.Show("Não foi possível abrir a plataforma.\n\n" + error.Message
                    + "\n\nConfira se há um navegador atualizado instalado e tente o atalho Abrir no navegador.",
                    "Eleitoral Pará", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
        private static int SelfTest() {
            foreach (string option in new string[] { "", "--browser", "--quality", "--archives", "--health" })
                if (!LaunchPolicy.Trusted(LaunchPolicy.Destination(option))) return 10;
            foreach (string bad in new string[] { "http://example.test/", LaunchPolicy.Origin + ".example.test/", LaunchPolicy.Origin + "/?token=x", LaunchPolicy.Origin + "/#javascript:alert(1)", "https://user:pass@" + new Uri(LaunchPolicy.Origin).Host + "/" })
                if (LaunchPolicy.Trusted(bad)) return 11;
            try { LaunchPolicy.Destination("https://example.test/"); return 12; } catch (ArgumentException) { }
            if (LaunchPolicy.BrowserKind("ChromeHTML") != "chrome" || LaunchPolicy.BrowserKind("MSEdgeHTM") != "edge" || LaunchPolicy.BrowserKind("FirefoxURL-123") != null) return 13;
            return 0;
        }
    }
}
