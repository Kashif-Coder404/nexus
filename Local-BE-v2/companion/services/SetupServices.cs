namespace Nexus.Agent.Services;

using System;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Security.Principal;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Microsoft.VisualBasic;

public static class SetupServices
{
    public const string TaskName = "NexusBackgroundService";

    public static string InstallDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Nexus");
    public static string TargetExePath => Path.Combine(InstallDir, "nexus.exe");
    public static string CurrentExePath => Environment.ProcessPath ?? Environment.GetCommandLineArgs()[0];

    public static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    public static bool EnsureElevated(string[] args)
    {
        if (IsAdministrator()) return true;

        try
        {
            Console.WriteLine("[*] Requesting Administrator privileges...");
            var psi = new ProcessStartInfo
            {
                FileName = CurrentExePath,
                Arguments = string.Join(" ", args),
                UseShellExecute = true,
                Verb = "runas"
            };

            var process = Process.Start(psi);
            process?.WaitForExit();
            Environment.Exit(process?.ExitCode ?? 0);
            return false;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            Console.WriteLine("\n[!] Administrator privileges were declined or cancelled.");
            Environment.Exit(1);
            return false;
        }
    }

    public static bool IsInstalled()
    {
        if (string.IsNullOrEmpty(CurrentExePath)) return false;
        return CurrentExePath.Equals(TargetExePath, StringComparison.OrdinalIgnoreCase);
    }
    public static void OpenDashboard()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://localhost:4100/",
                UseShellExecute = true

            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Setup] Could not open browser: {ex.Message}");
        }
    }
    public static void StopRunningInstances()
    {
        int currentPid = Environment.ProcessId;
        string[] targetNames = ["nexus", "nexus.agent"];

        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (targetNames.Contains(process.ProcessName.ToLowerInvariant()) && process.Id != currentPid)
                {
                    Console.WriteLine($"[*] Stopping existing process: {process.ProcessName} (PID: {process.Id})");
                    process.Kill();
                    process.WaitForExit(3000);
                }
            }
            catch
            {
                // Process may have already exited or insufficient permissions
            }
        }
    }
    public static void AddPath()
    {
        string newPath = InstallDir;
        var paths = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User)?.Split(";", StringSplitOptions.RemoveEmptyEntries).ToList();
        if (paths == null) return;
        if (!paths.Contains(newPath, StringComparer.OrdinalIgnoreCase))
        {
            paths.Add(newPath);
            Environment.SetEnvironmentVariable("Path", string.Join(";", paths), EnvironmentVariableTarget.User);
            Console.WriteLine("[Setup] Added Nexus to User PATH.");
        }
    }
    public static void RemovePath()
    {
        string pathToRemove = InstallDir;
        var paths = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User)?.Split(";", StringSplitOptions.RemoveEmptyEntries).ToList();
        if (paths == null) return;
        paths.RemoveAll(p => p.Equals(pathToRemove, StringComparison.OrdinalIgnoreCase));
        Environment.SetEnvironmentVariable("Path", string.Join(";", paths), EnvironmentVariableTarget.User);
        Console.WriteLine("[Setup] Removed Nexus from User PATH.");
    }
    public static void SheduleTask(bool isRemove = false)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = "",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            if (isRemove)
            {
                psi.Arguments = $"/delete /tn \"{TaskName}\" /f";
                using var removeProcess = Process.Start(psi);
                removeProcess?.WaitForExit(5000);
                Console.WriteLine("[Setup] Removed Windows Startup Task.");
                return;
            }
            psi.Arguments = $"/create /tn \"{TaskName}\" /tr \"\\\"{TargetExePath}\\\" --service\" /sc onlogon /rl HIGHEST /f";
            using var proc = Process.Start(psi);
            string error = proc?.StandardError.ReadToEnd() ?? "";
            proc?.WaitForExit(5000);
            if (proc?.ExitCode == 0)
            {
                Console.WriteLine("[Setup] Registered Windows Startup Task with Highest Privileges.");
            }
            else
            {
                Console.WriteLine($"[!] Failed to register Windows Startup Task (Exit Code: {proc?.ExitCode}). {error}".Trim());
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Setup] Task scheduler error: {ex.Message}");
        }
    }

    public static void AddDefenderExclusion(bool isRemove = false)
    {
        try
        {
            var cmd = isRemove
                ? $"Remove-MpPreference -ExclusionPath '{InstallDir}' -ErrorAction SilentlyContinue"
                : $"Add-MpPreference -ExclusionPath '{InstallDir}' -ErrorAction SilentlyContinue";

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{cmd}\"",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            using var proc = Process.Start(psi);
            proc?.WaitForExit(5000);
            if (!isRemove)
            {
                Console.WriteLine("[Setup] Added Windows Defender exclusion for Nexus folder.");
            }
            else
            {
                Console.WriteLine("[Setup] Removed Windows Defender exclusion for Nexus folder.");
            }
        }
        catch { }
    }

    public static void ConfigureFirewall(bool isRemove = false)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netsh.exe",
                Arguments = isRemove
                    ? "advfirewall firewall delete rule name=\"Nexus Companion Agent\""
                    : "advfirewall firewall add rule name=\"Nexus Companion Agent\" dir=in action=allow protocol=TCP localport=4100 profile=any",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            using var proc = Process.Start(psi);
            proc?.WaitForExit(5000);
            if (!isRemove)
            {
                Console.WriteLine("[Setup] Added Windows Firewall rule for Port 4100.");
            }
            else
            {
                Console.WriteLine("[Setup] Removed Windows Firewall rule for Port 4100.");
            }
        }
        catch { }
    }

    public static async Task InstallAsync()
    {
        Console.WriteLine();
        Console.WriteLine("==================================================");
        Console.WriteLine("   Nexus Companion Agent - Installing");
        Console.WriteLine("==================================================");
        Console.WriteLine("[*] Preparing installation...");

        try
        {
            StopRunningInstances();

            if (!Directory.Exists(InstallDir))
            {
                Directory.CreateDirectory(InstallDir);
            }

            if (!IsInstalled())
            {
                File.Copy(CurrentExePath, TargetExePath, overwrite: true);
                Console.WriteLine("[Setup] Copied binary to " + TargetExePath);
            }
            else
            {
                Console.WriteLine("[Setup] Verified binary at " + TargetExePath);
            }

            AddPath();
            await Task.WhenAll(
                Task.Run(() => AddDefenderExclusion(isRemove: false)),
                Task.Run(() => ConfigureFirewall(isRemove: false)),
                Task.Run(() => SheduleTask(isRemove: false))
            );

            // Start the installed agent silently in the background with HIGHEST elevation
            try
            {
                var taskProc = Process.Start(new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = $"/run /tn \"{TaskName}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                taskProc?.WaitForExit(3000);

                if (taskProc?.ExitCode != 0)
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = TargetExePath,
                        Arguments = "--service",
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    });
                }
            }
            catch
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = TargetExePath,
                    Arguments = "--service",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                });
            }

            // OpenDashboard();

            // Console.WriteLine("[SUCCESS] All done! Opening pairing dashboard...");
            await Task.Delay(2500);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[!] Installation failed: {ex.Message}");
            await Task.Delay(3000);
        }

        await Task.CompletedTask;
    }

    public static async Task RevokeFromCloudAsync()
    {
        try
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var tokenFile = Path.Combine(appData, "Nexus", "deviceToken.json");
            if (!File.Exists(tokenFile))
            {
                Console.WriteLine("[Nexus] No local device token found to revoke.");
                return;
            }

            var content = await File.ReadAllTextAsync(tokenFile);
            var node = JsonNode.Parse(content);
            var token = node?["token"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(token))
            {
                Console.WriteLine("[Nexus] Token in deviceToken.json is empty.");
                return;
            }

            Console.WriteLine("[Nexus] Notifying cloud backend to revoke device registration...");
            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(6);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            string[] endpoints = new[]
            {
#if DEBUG
                "http://localhost:3100/api/device/revoke-self",
#endif
                "https://nexus-v2-e38m.onrender.com/api/device/revoke-self"
            };

            foreach (var url in endpoints)
            {
                try
                {
                    var response = await client.PostAsync(url, null);
                    if (response.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"[Nexus] Cloud device revoked successfully via {url}!");
                        break;
                    }
                    else
                    {
                        Console.WriteLine($"[Nexus] Cloud revoke returned status {response.StatusCode} from {url}");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Nexus] Could not reach {url}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Nexus] Error during cloud device revoke: {ex.Message}");
        }
    }

    public static async Task UninstallAsync()
    {
        Console.WriteLine("[Nexus] Uninstalling Nexus...");
        try
        {
            await RevokeFromCloudAsync();
            StopRunningInstances();
            await Task.WhenAll(
                Task.Run(() => SheduleTask(isRemove: true)),
                Task.Run(() => ConfigureFirewall(isRemove: true)),
                Task.Run(() => AddDefenderExclusion(isRemove: true))
            );
            RemovePath();

            // Safe Token Cleanup (only delete deviceToken.json instead of wiping AppData\Nexus which locks on Electron)
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var tokenFile = Path.Combine(appData, "Nexus", "deviceToken.json");
            try
            {
                if (File.Exists(tokenFile))
                {
                    File.Delete(tokenFile);
                    Console.WriteLine("[Setup] Removed local device token.");
                }
            }
            catch { }

            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"{InstallDir}\"",
                CreateNoWindow = true,
                UseShellExecute = false
            });
            Console.WriteLine("[SUCCESS] Uninstalled successfully!");
            Environment.Exit(0);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[!] Uninstall error: {ex.Message}");
        }
        await Task.CompletedTask;
    }
}