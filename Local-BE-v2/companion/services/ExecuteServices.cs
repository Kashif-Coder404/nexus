namespace Nexus.Agent.Services;

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.VisualBasic;
using Nexus.Agent.Models;
using Porta.Pty;

public static class ExecuteServices
{
    public const int threshold = 5000;
    public static readonly ConcurrentDictionary<string, IPtyConnection> ActiveTasks = new();
    public static readonly ConcurrentDictionary<string, ConcurrentQueue<string>> TaskLogBuffers = new();
    public static readonly ConcurrentDictionary<string, int> TaskExitCodes = new();
    private static readonly Regex OscTitleRegex = new(@"(?:\x1b\]|\u001b\]|\])0;[^\x07\x1b\r\n]*(?:\x07|\x1b\\)?", RegexOptions.Compiled);
    private static readonly Regex CursorPositionRegex = new(@"[\u001b\x1b]\[\d+;\d+[Hhf]", RegexOptions.Compiled);
    private static readonly Regex AnsiCsiRegex = new(@"[\u001b\x1b]\[[0-9;?]*[a-zA-Z]", RegexOptions.Compiled);
    private static readonly Regex VtCharsetRegex = new(@"[\u001b\x1b]\([a-zA-Z]", RegexOptions.Compiled);
    private static readonly Regex VtMiscRegex = new(@"[\u001b\x1b][=>]", RegexOptions.Compiled);
    private static readonly Regex ConsecutiveNewlinesRegex = new(
        @"(\r?\n){3,}",
        RegexOptions.Compiled
    );
    public static string SanitizeTerminalOutput(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return string.Empty;
        try
        {
            string cleaned = CursorPositionRegex?.Replace(raw, "\r\n") ?? raw;
            cleaned = AnsiCsiRegex?.Replace(cleaned, string.Empty) ?? cleaned;
            cleaned = VtCharsetRegex?.Replace(cleaned, string.Empty) ?? cleaned;
            cleaned = VtMiscRegex?.Replace(cleaned, string.Empty) ?? cleaned;
            cleaned = OscTitleRegex?.Replace(cleaned, string.Empty) ?? cleaned;
            cleaned = cleaned.Replace("\x07", string.Empty);
            cleaned = ConsecutiveNewlinesRegex?.Replace(cleaned, "\r\n") ?? cleaned;
            return cleaned.Trim();
        }
        catch
        {
            return raw.Trim();
        }
    }

    public static async Task<CommandResponse> RunAsync(RunCommandDto body)
    {
        if (string.IsNullOrWhiteSpace(body.Command))
        {
            return new CommandResponse
            {
                Cmd = "",
                Msg = "Command cannot be empty.",
                IsSuccess = false,
                ExitCode = 1
            };
        }

        // Prefix script with environment configuration:
        // 1. $ProgressPreference = 'SilentlyContinue' suppresses noisy CLIXML progress bars from stderr.
        // 2. $OutputEncoding = UTF-8 ensures full character fidelity.
        // 3. Read-Host shim forwards console prompts to stdout so they stream immediately.
        string fullScript = $@"
$ProgressPreference = 'SilentlyContinue';
Set-PSReadLineOption -BellStyle None -ErrorAction SilentlyContinue;
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Remove-Item Alias:echo -Force -ErrorAction SilentlyContinue;
function echo {{ Write-Output ($args -join ' ') }};
function Read-Host {{ param([Parameter(Position=0)][string]$Prompt) if ($Prompt) {{ [Console]::Out.Write($Prompt + ': ') }}; Microsoft.PowerShell.Utility\Read-Host }}
{body.Command}
";

        byte[] cmdBytes = Encoding.Unicode.GetBytes(fullScript);
        string encodedCmd = Convert.ToBase64String(cmdBytes);

        var options = new PtyOptions
        {
            App = "powershell.exe",
            CommandLine = ["-NoProfile", "-EncodedCommand", encodedCmd],
            Cwd = Directory.GetCurrentDirectory(),
            Cols = 120,
            Rows = 30,
            Environment = new Dictionary<string, string>
            {
                ["PYTHONUNBUFFERED"] = "1",
                ["FORCE_COLOR"] = "1",
                ["GIT_FLUSH"] = "1",
                ["CLICOLOR_FORCE"] = "1",
                ["TERM"] = "xterm-256color",
                ["COLORTERM"] = "truecolor"
            }
        };

        var outputBuilder = new StringBuilder();
        string currentTaskId = body.TaskId ?? "";
        IPtyConnection? pty = null;

        try
        {
            pty = await PtyProvider.SpawnAsync(options, CancellationToken.None);
            int pid = pty.Pid;
            currentTaskId = body.TaskId ?? $"task-{pid}";
            ActiveTasks.TryAdd(currentTaskId, pty);
            TaskLogBuffers.TryAdd(currentTaskId, new ConcurrentQueue<string>());

            var exitTcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
            pty.ProcessExited += (s, e) => exitTcs.TrySetResult(e.ExitCode);

            // Asynchronous chunk-based stream reader: captures raw VT100 / ANSI text, progress bars, and prompts immediately
            var streamTask = Task.Run(async () =>
            {
                byte[] buffer = new byte[1024];
                try
                {
                    using var stream = pty.ReaderStream;
                    while (true)
                    {
                        int read = await stream.ReadAsync(buffer, 0, buffer.Length);
                        if (read == 0) break;

                        string chunk = Encoding.UTF8.GetString(buffer, 0, read);
                        // 1. Strip OSC window title noise and ASCII BEL (\x07) to completely extinguish Windows system chimes
                        chunk = OscTitleRegex.Replace(chunk, string.Empty).Replace("\x07", string.Empty);
                        // Console.Write(chunk);
                        outputBuilder.Append(chunk);

                        var queue = TaskLogBuffers.GetOrAdd(currentTaskId, _ => new ConcurrentQueue<string>());
                        queue.Enqueue(chunk);
                        while (queue.Count > 200) queue.TryDequeue(out _);

                        _ = WebSocketClientService.BroadcastEventAsync(new
                        {
                            type = "cmd_chunk",
                            taskId = currentTaskId,
                            pid,
                            chunk
                        });
                    }
                }
                catch { }
            });

            if (body.IsDaemon)
            {
                return TaskManager("daemon", body.Command, pty, currentTaskId, outputBuilder, exitTcs);
            }

            // 1.5s threshold race (<1.5s returns synchronously to AI; >1.5s promotes to background task)
            Task winner = await Task.WhenAny(exitTcs.Task, Task.Delay(threshold));

            if (winner == exitTcs.Task)
            {
                int exitCode = await exitTcs.Task;
                await Task.Delay(150);
                ActiveTasks.TryRemove(currentTaskId, out _);
                pty.Dispose();

                return new CommandResponse
                {
                    Cmd = body.Command,
                    Msg = exitCode == 0 ? "Command executed successfully." : "Command failed.",
                    TerminalOutput = SanitizeTerminalOutput(outputBuilder.ToString()),
                    TerminalError = "",
                    IsSuccess = exitCode == 0,
                    ExitCode = exitCode,
                    Pid = pid.ToString(),
                    TaskId = currentTaskId
                };
            }

            return TaskManager("event", body.Command, pty, currentTaskId, outputBuilder, exitTcs);
        }
        catch (Exception ex)
        {
            try { pty?.Kill(); } catch { }
            pty?.Dispose();
            ActiveTasks.TryRemove(currentTaskId, out _);

            return new CommandResponse
            {
                Cmd = body.Command,
                Msg = $"Execution error: {ex.Message}",
                TerminalOutput = outputBuilder.ToString(),
                TerminalError = ex.Message,
                IsSuccess = false,
                ExitCode = 1,
                Pid = pty?.Pid.ToString(),
                TaskId = currentTaskId
            };
        }
    }

    public static CommandResponse TaskManager(string Work, string command, IPtyConnection pty, string taskId, StringBuilder outputBuilder, TaskCompletionSource<int> exitTcs)
    {
        int pid = pty.Pid;
        ActiveTasks.TryAdd(taskId, pty);

        _ = WebSocketClientService.BroadcastEventAsync(new
        {
            type = "task_promoted",
            taskId,
            pid,
            cmd = command
        });

        bool isDaemon = Work != "event";
        _ = Task.Run(async () => await TaskWatcher(pty, taskId, pid, outputBuilder, exitTcs, isDaemon));

        return new CommandResponse
        {
            Cmd = command,
            Msg = isDaemon
                ? $"Daemon service '{taskId}' started in the background (PID: {pid}). Monitoring in the Tasks tab."
                : $"Task '{taskId}' is running in the background (PID: {pid}). Live logs are streaming in the Tasks tab.",
            TerminalOutput = SanitizeTerminalOutput(outputBuilder.ToString()),
            TerminalError = "",
            IsSuccess = true,
            ExitCode = null,
            Pid = pid.ToString(),
            TaskId = taskId
        };
    }

    public static async Task TaskWatcher(IPtyConnection pty, string currentTaskId, int pid, StringBuilder outputBuilder, TaskCompletionSource<int> exitTcs, bool isDaemon)
    {
        string type = isDaemon ? "daemon_stopped" : "task_finished";
        string taskId = currentTaskId;
        int exitCode = 0;
        bool crashed = false;
        string terminalOutput = "";
        string terminalError = "";
        try
        {
            int finalExit = await exitTcs.Task;
            await Task.Delay(100);
            TaskExitCodes[currentTaskId] = finalExit;
            ActiveTasks.TryRemove(currentTaskId, out _);
            exitCode = finalExit;
            crashed = finalExit != 0;

            // Take the last ~40 lines so we don't flood the AI with thousands of progress bar lines
            string fullSanitized = SanitizeTerminalOutput(outputBuilder.ToString());
            var lines = fullSanitized.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            terminalOutput = string.Join("\n", lines.TakeLast(40));
        }
        catch (Exception ex)
        {
            exitCode = 1;
            crashed = true;
            terminalError = ex.Message;
        }


        await WebSocketClientService.BroadcastEventAsync(new
        {
            type,
            taskId,
            pid,
            exitCode,
            crashed,
            terminalOutput,
            terminalError
        });
        pty.Dispose();

    }

    public static CommandResponse PeekTask(string taskId, int limit = 50)
    {
        bool isRunning = false;
        int? exitCode = null;
        string? pid = null;

        if (ActiveTasks.TryGetValue(taskId, out var pty))
        {
            try
            {
                pid = pty.Pid.ToString();
                isRunning = true;
            }
            catch
            {
                isRunning = false;
            }
        }
        else if (TaskExitCodes.TryGetValue(taskId, out var cachedExit))
        {
            exitCode = cachedExit;
            isRunning = false;
        }

        string combinedOutput = "";
        if (TaskLogBuffers.TryGetValue(taskId, out var buffer))
        {
            var lastLines = buffer.TakeLast(limit).ToArray();
            combinedOutput = string.Join("", lastLines);
        }

        return new CommandResponse
        {
            TaskId = taskId,
            IsSuccess = true,
            Msg = isRunning ? "Task is still running." : $"Task stopped (Exit code: {exitCode}).",
            TerminalOutput = SanitizeTerminalOutput(combinedOutput),
            ExitCode = exitCode,
            Pid = pid
        };
    }

    public static async Task SendTaskInput(string taskId, string input, bool isRaw = false)
    {
        if (ActiveTasks.TryGetValue(taskId, out var pty))
        {
            try
            {
                string payload = isRaw
                    ? (input ?? string.Empty)
                    : ((input != null && input.StartsWith("\x1b"))
                        ? input
                        : (input ?? "").TrimEnd('\r', '\n') + "\r\n");

                byte[] bytes = Encoding.UTF8.GetBytes(payload);
                await pty.WriterStream.WriteAsync(bytes, 0, bytes.Length);
                await pty.WriterStream.FlushAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending input to task {taskId}: {ex.Message}");
            }
        }
        else
        {
            throw new InvalidOperationException($"Task {taskId} is not running.");
        }
    }
    public static bool KillTask(string taskIdOrPid)
    {
        // 1. Check if TaskId matches
        if (ActiveTasks.TryRemove(taskIdOrPid, out var pty))
        {
            int pid = pty.Pid;
            try { pty.Kill(); } catch { }
            try
            {
                var p = System.Diagnostics.Process.GetProcessById(pid);
                p.Kill(entireProcessTree: true);
                p.Dispose();
            }
            catch { }
            pty.Dispose();
            return true;
        }

        // 2. Check if PID matches
        if (int.TryParse(taskIdOrPid, out int targetPid))
        {
            foreach (var kvp in ActiveTasks)
            {
                if (kvp.Value.Pid == targetPid)
                {
                    ActiveTasks.TryRemove(kvp.Key, out _);
                    try { kvp.Value.Kill(); } catch { }
                    kvp.Value.Dispose();
                    break;
                }
            }

            try
            {
                var p = System.Diagnostics.Process.GetProcessById(targetPid);
                p.Kill(entireProcessTree: true);
                p.Dispose();
                return true;
            }
            catch { }
        }

        return false;
    }

    public static async Task<CommandResponse> StartApplication(StartAppDto body)
    {
        string target = body.Application?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(target))
        {
            return new CommandResponse
            {
                Cmd = "",
                Msg = "Application path or name cannot be empty.",
                IsSuccess = false,
                ExitCode = 1
            };
        }
        var ignoredWrappers = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "conhost", "cmd", "powershell", "pwsh", "openconsole", "werfault"
            };
        try
        {
            var beforePids = Process.GetProcesses().Select(p => p.Id).ToHashSet();

            var psi = new ProcessStartInfo
            {
                FileName = target,
                Arguments = body.Arguments,
                WorkingDirectory = Directory.Exists(target) ? target : (File.Exists(target) ? Path.GetDirectoryName(target) : ""),
                UseShellExecute = true,
            };

            var process = Process.Start(psi);

            // Wait 5000ms for heavier apps/games to spawn and render their UI
            await Task.Delay(5000);

            Process? detectedProcess = null;

            var afterProcesses = Process.GetProcesses();
            var newProcess = afterProcesses.FirstOrDefault(p => !beforePids.Contains(p.Id))
                          ?? (process != null && !process.HasExited ? process : null);

            int initialPid = newProcess?.Id ?? process?.Id ?? 0;
            if (initialPid > 0)
            {
                try
                {
                    var p = Process.GetProcessById(initialPid);
                    if (!p.HasExited)
                    {
                        detectedProcess = p;
                    }
                }
                catch
                {
                    // Launcher stub already exited; fall back to name lookup
                }
            }

            // Fallback: search by process name if PID exited or lacks a main window
            if (detectedProcess == null || string.IsNullOrWhiteSpace(detectedProcess.MainWindowTitle))
            {
                string appName = Path.GetFileNameWithoutExtension(target);
                var matchingProcesses = Process.GetProcessesByName(appName);

                // Prefer the process instance holding an active window
                var processByName = matchingProcesses.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.MainWindowTitle))
                                 ?? matchingProcesses.FirstOrDefault();

                if (processByName != null)
                {
                    detectedProcess = processByName;
                }
            }

            if (detectedProcess != null)
            {
                int livePid = detectedProcess.Id;
                string procName = detectedProcess.ProcessName;
                string windowTitle = detectedProcess.MainWindowTitle;

                Console.WriteLine($"[LAUNCHED] {procName} (PID: {livePid}, Window: '{windowTitle}')");

                string winInfo = string.IsNullOrWhiteSpace(windowTitle) ? "" : $", Window: \"{windowTitle}\"";
                return new CommandResponse
                {
                    Cmd = target,
                    Msg = $"Application '{procName}' launched successfully.",
                    TerminalOutput = $"[LAUNCHED] {procName} (PID: {livePid}{winInfo})",
                    IsSuccess = true,
                    ExitCode = 0,
                    Pid = livePid.ToString()
                };
            }

            // If neither PID nor Name matched
            return new CommandResponse
            {
                Cmd = target,
                Msg = $"Failed to detect running process for: {target}",
                TerminalError = "Process could not be verified after launch.",
                IsSuccess = false,
                ExitCode = 1,
                Pid = ""
            };
        }
        catch (Exception ex)
        {
            var apps = await SearchServices.SearchApp(target, 10);

            var distinctApps = apps
                .DistinctBy(a => a.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();


            var formattedList = distinctApps.Count > 0
                ? string.Join("\n", distinctApps.Select(a => $"- {a.Name} => {a.Path}"))
                : "No matching applications found on system.";

            return new CommandResponse
            {
                Cmd = body.Application ?? "",
                Msg = $"Application '{target}' not found directly. Found {distinctApps.Count} candidates.",
                TerminalOutput = $"[MATCHING APPLICATIONS FOUND]:\n{formattedList}\n\nPlease call launch_app with the exact path from above.",
                TerminalError = $"Failed to start application '{target}': {ex.Message}",
                IsSuccess = false,
                ExitCode = 1,
                Pid = ""
            };
        }


    }
}