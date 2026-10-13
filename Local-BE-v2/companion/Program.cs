using System.Diagnostics;
using Nexus.Agent.Models;
using System.Text.Json;
using Nexus.Agent.Services;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using Microsoft.Extensions.Hosting;
using System.Runtime.InteropServices;


// If running as background service, immediately detach and destroy the console


// 2. FIRST: If running from Downloads / outside install dir, run the installer popup!

#if !DEBUG

[DllImport("kernel32.dll")]
static extern bool AttachConsole(int dwProcessId);

[DllImport("kernel32.dll")]
static extern bool FreeConsole();

const int ATTACH_PARENT_PROCESS = -1;

// If executed as background service, detach and destroy console to run silently without terminal pollution.
// Otherwise, attach to existing parent terminal so 'nexus --help' / 'nexus --version' prints normally.
if (args.Contains("--service", StringComparer.OrdinalIgnoreCase))
{
    FreeConsole();
}
else
{
    AttachConsole(ATTACH_PARENT_PROCESS);
}

// Allow read-only CLI commands (--version, --help) without elevation or install check
if (args.Length > 0)
{
    string cmd = args[0].ToLowerInvariant();
    if (cmd is "--version" or "-v")
    {
        Console.WriteLine("Nexus Companion Agent v2.6.1 (x64 Windows)");
        return;
    }

    if (cmd is "--help" or "-h" or "/?")
    {
        Console.WriteLine("==================================================");
        Console.WriteLine("   Nexus Companion Agent v2.6.1 (x64 Windows)");
        Console.WriteLine("   Pairing Dashboard: http://localhost:4100/");
        Console.WriteLine("==================================================");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  nexus --start          : Start background agent");
        Console.WriteLine("  nexus --stop           : Stop background agent");
        Console.WriteLine("  nexus --install   (-i) : Install & register background service");
        Console.WriteLine("  nexus --uninstall (-u) : Remove & clean files");
        Console.WriteLine("  nexus --version   (-v) : Print current version");
        Console.WriteLine("  nexus --help      (-h) : Show this help message");
        return;
    }
}

if (!SetupServices.IsInstalled())
{
    SetupServices.EnsureElevated(args.Length > 0 ? args : ["--install"]);
    Console.Title = "Nexus Setup";
    await SetupServices.InstallAsync();
    await Task.Delay(1500);
    return;
}
#endif

// 3. Handle CLI Commands (if user passed any arguments)
if (args.Length > 0)
{
    string command = args[0].ToLowerInvariant();

    if (command is "--install" or "-i")
    {
        SetupServices.EnsureElevated(args);
        await SetupServices.InstallAsync();
        return;
    }

    if (command is "--uninstall" or "-u")
    {
        SetupServices.EnsureElevated(args);
        await SetupServices.UninstallAsync();
        return;
    }

    if (command is "--stop")
    {
        SetupServices.StopRunningInstances();
        Console.WriteLine("[Nexus] All running instances stopped.");
        return;
    }

    if (command is "--start")
    {
        var running = Process.GetProcessesByName("nexus").FirstOrDefault(p => p.Id != Environment.ProcessId);
        if (running != null)
        {
            Console.WriteLine($"[Nexus] Nexus is already running in the background (PID: {running.Id}).");
            Console.WriteLine("Dashboard: http://localhost:4100/");
            return;
        }

        // Try launching via the scheduled task (starts with HIGHEST admin privileges silently)
        var taskProc = Process.Start(new ProcessStartInfo
        {
            FileName = "schtasks.exe",
            Arguments = $"/run /tn \"{SetupServices.TaskName}\"",
            CreateNoWindow = true,
            UseShellExecute = false
        });
        taskProc?.WaitForExit(3000);

        if (taskProc?.ExitCode == 0)
        {
            Console.WriteLine("[Nexus] Started Nexus background agent on http://localhost:4100/");
            return;
        }

        // Fallback: direct start with elevation if not installed via task
        SetupServices.EnsureElevated(args);

        Process.Start(new ProcessStartInfo
        {
            FileName = SetupServices.TargetExePath,
            Arguments = "--service",
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });
        Console.WriteLine("[Nexus] Started Nexus background agent on http://localhost:4100/");
        return;
    }

    if (command is "--version" or "-v")
    {
        Console.WriteLine("Nexus Companion Agent v2.6.1 (x64 Windows)");
        return;
    }

    if (command is "--service")
    {
        // Internal flag: proceed to start the web server!
    }
    else
    {
        // Unknown flag or --help: show clean help menu and exit!
        Console.WriteLine("==================================================");
        Console.WriteLine("   Nexus Companion Agent v2.6.1 (x64 Windows)");
        Console.WriteLine("   Pairing Dashboard: http://localhost:4100/");
        Console.WriteLine("==================================================");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  nexus --start          : Start background agent");
        Console.WriteLine("  nexus --stop           : Stop background agent");
        Console.WriteLine("  nexus --install   (-i) : Install & register background service");
        Console.WriteLine("  nexus --uninstall (-u) : Remove & clean files");
        Console.WriteLine("  nexus --version   (-v) : Print current version");
        Console.WriteLine("  nexus --help      (-h) : Show this help message");
        return;
    }
}
else
{
    // 4. User typed just "nexus" in terminal with NO flags, or double-clicked:
    if (!SetupServices.IsInstalled())
    {
        Console.WriteLine("==================================================");
        Console.WriteLine("   Nexus Companion Agent - First-Time Setup");
        Console.WriteLine("==================================================");
        Console.WriteLine();
        Console.WriteLine("[*] Starting installation & registering background service...");
        SetupServices.EnsureElevated(["--install"]);
        await SetupServices.InstallAsync();
        return;
    }

    var running = Process.GetProcessesByName("nexus").FirstOrDefault(p => p.Id != Environment.ProcessId);
    if (running != null)
    {
        Console.WriteLine($"[Nexus] Already running in the background (PID: {running.Id}).");
        Console.WriteLine("Pairing Dashboard: http://localhost:4100/");
        Console.WriteLine("Type 'nexus --help' for commands, or 'nexus --stop' to terminate.");
    }
    else
    {
        Console.WriteLine("[Nexus] Agent is currently stopped.");
        Console.WriteLine("Run 'nexus --start' to start in background, or 'nexus --help' for options.");
    }
    return;
}


// 5. RUN THE WEB SERVER (Runs when --service is passed or when launched as service)
// Only the dedicated background daemon is allowed to run the server
if (!args.Contains("--service", StringComparer.OrdinalIgnoreCase))
{
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Warning); // Silence all internal HTTP ping spam!
builder.Services.AddHostedService<WebSocketClientService>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();
app.UseWebSockets();

// 1. Direct P2P LAN WebSocket Stream for Devices.tsx & Local Dashboard
app.Use(async (context, next) =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        using var ws = await context.WebSockets.AcceptWebSocketAsync();
        Console.WriteLine("[LOCAL WS] Browser / Client connected directly via LAN!");

        // Handshake welcome message
        var welcomeMsg = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { message = "Connected to Local-BE!" }));
        await ws.SendAsync(welcomeMsg, WebSocketMessageType.Text, true, CancellationToken.None);

        // Immediately push initial telemetry snapshot
        var initial = Encoding.UTF8.GetBytes(SystemInfoService.GetLiveFeedJson());
        await ws.SendAsync(initial, WebSocketMessageType.Text, true, CancellationToken.None);

        // Stream telemetry every 5 seconds while connected
        while (ws.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(1000, context.RequestAborted);
                if (ws.State == WebSocketState.Open)
                {
                    var bytes = Encoding.UTF8.GetBytes(SystemInfoService.GetLiveFeedJson());
                    await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            catch { break; }
        }
        return;
    }
    await next();
});

// 2. Serve Local Pairing Dashboard (setupPage.html)
string htmlPath = Path.Combine(AppContext.BaseDirectory, "setupPage.html");
if (!File.Exists(htmlPath))
{
    htmlPath = Path.Combine(Directory.GetCurrentDirectory(), "setupPage.html");
}

string GetHtmlContent()
{
    if (File.Exists(htmlPath)) return File.ReadAllText(htmlPath);
    try
    {
        using var stream = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("Nexus.Agent.setupPage.html");
        if (stream != null)
        {
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        }
    }
    catch { }
    return "<h1>Nexus Agent Running</h1><p>Setup page (setupPage.html) not found in directory.</p>";
}

app.MapGet("/", () => Results.Content(GetHtmlContent(), "text/html"));
app.MapGet("/setup", () => Results.Content(GetHtmlContent(), "text/html"));
app.MapGet("/pairing", () => Results.Content(GetHtmlContent(), "text/html"));

// 3. Status & Pairing Endpoints
app.MapGet("/api/pairing-status", async () =>
{
    string? token = await WebSocketClientService.GetTokenAsync();
    string? code = DeviceStateManager.CurrentPairingCode;
    if (DeviceStateManager.IsConnectedToBackend && string.IsNullOrEmpty(code) && string.IsNullOrEmpty(token))
    {
        code = DeviceStateManager.GenerateNewPairingCode();
        _ = WebSocketClientService.SendPairingInitAsync();
    }

    bool isInstalled = File.Exists(SetupServices.TargetExePath);

    return Results.Ok(new
    {
        success = true,
        isConnected = DeviceStateManager.IsConnectedToBackend,
        isPaired = !string.IsNullOrEmpty(token),
        isEnable = DeviceStateManager.IsServiceEnabled,
        isInstalled,
        installPath = SetupServices.TargetExePath,
        token,
        deviceName = Environment.MachineName,
        code,
        expiresat = DeviceStateManager.CodeExpiresAt?.ToString("o"),
        remainingSeconds = DeviceStateManager.RemainingSeconds,
        cooldown = DeviceStateManager.CooldownSecondsRemaining,
        pairingError = DeviceStateManager.PairingError,
        message = ""
    });
});

app.MapGet("/getParingCode", () =>
{
    string? code = DeviceStateManager.CurrentPairingCode;
    if (!DeviceStateManager.IsConnectedToBackend)
    {
        return Results.Ok(new
        {
            success = false,
            hasCode = !string.IsNullOrEmpty(code),
            code,
            expiresat = DeviceStateManager.CodeExpiresAt?.ToString("o"),
            remainingSeconds = DeviceStateManager.RemainingSeconds,
            cooldown = DeviceStateManager.CooldownSecondsRemaining,
            isConnected = false,
            message = "Backend server is not connected."
        });
    }
    if (string.IsNullOrEmpty(code))
    {
        code = DeviceStateManager.GenerateNewPairingCode();
        _ = WebSocketClientService.SendPairingInitAsync();
    }
    return Results.Ok(new
    {
        success = true,
        hasCode = !string.IsNullOrEmpty(code),
        code,
        expiresat = DeviceStateManager.CodeExpiresAt?.ToString("o"),
        remainingSeconds = DeviceStateManager.RemainingSeconds,
        cooldown = DeviceStateManager.CooldownSecondsRemaining,
        isConnected = DeviceStateManager.IsConnectedToBackend,
        message = ""
    });
});

app.MapGet("/getService", () => Results.Ok(new
{
    success = true,
    isEnable = DeviceStateManager.IsServiceEnabled
}));

app.MapPut("/switch", async (JsonElement body) =>
{
    bool value = body.TryGetProperty("value", out var v) && v.GetBoolean();
    DeviceStateManager.IsServiceEnabled = value;
    await WebSocketClientService.BroadcastStatusAsync(value);
    return Results.Ok(new
    {
        success = true,
        message = "Service switched successfully."
    });
});

app.MapPost("/api/generate-code", async () =>
{
    if (DeviceStateManager.CooldownSecondsRemaining > 0)
    {
        return Results.Ok(new
        {
            success = false,
            code = DeviceStateManager.CurrentPairingCode,
            expiresat = DeviceStateManager.CodeExpiresAt?.ToString("o"),
            remainingSeconds = DeviceStateManager.RemainingSeconds,
            cooldown = DeviceStateManager.CooldownSecondsRemaining,
            message = $"Please wait {DeviceStateManager.CooldownSecondsRemaining}s before generating a new code."
        });
    }

    string code = DeviceStateManager.GenerateNewPairingCode();
    await WebSocketClientService.SendPairingInitAsync();
    return Results.Ok(new
    {
        success = true,
        code = code,
        expiresat = DeviceStateManager.CodeExpiresAt?.ToString("o"),
        remainingSeconds = DeviceStateManager.RemainingSeconds,
        cooldown = 15,
        message = "New pairing code generated"
    });
});

app.MapPost("/api/stop-server", (IHostApplicationLifetime lifetime) =>
{
    _ = Task.Run(async () =>
    {
        await Task.Delay(500);
        lifetime.StopApplication();
    });
    return Results.Ok(new { success = true, message = "Nexus service is stopping..." });
});

app.MapPost("/api/uninstall", async (IHostApplicationLifetime lifetime) =>
{
    await WebSocketClientService.SendRevokeAsync();

    _ = Task.Run(async () =>
    {
        await Task.Delay(500);
        await SetupServices.UninstallAsync();
    });
    return Results.Ok(new { success = true, message = "Uninstaller launched successfully." });
});

// 4. Existing Test & Debug Endpoints
app.MapPost("/test-cmd", async (RunCommandDto body) =>
{
    var response = await ExecuteServices.RunAsync(body);
    return Results.Ok(response);
});
app.MapPost("/test-search_app", async (JsonElement body) =>
{
    string searchToken = body.GetProperty("searchToken").ToString();
    int maxResult = body.TryGetProperty("maxResult", out var mr) ? int.Parse(mr.ToString()) : 10;
    string? extension = body.TryGetProperty("extension", out var ext) ? ext.GetString() : null;

    var response = await SearchServices.SearchApp(searchToken, maxResult, extension);
    return Results.Ok(response);
});

app.MapPost("/test-search", async (JsonElement body) =>
{
    string searchToken = body.GetProperty("searchToken").ToString();
    int maxResult = body.TryGetProperty("maxResult", out var mr) ? int.Parse(mr.ToString()) : 10;
    string type = body.TryGetProperty("type", out var t) ? t.ToString() : "both";
    SearchType searchType = type.ToLower() switch
    {
        "file" => SearchType.File,
        "folder" => SearchType.Folder,
        _ => SearchType.Both
    };

    HashSet<string>? exts = null;
    if (body.TryGetProperty("extension", out var ext) && !string.IsNullOrWhiteSpace(ext.GetString()))
    {
        exts = [ext.GetString()!];
    }

    var response = await SearchServices.Search(searchType, searchToken, maxResult, extensions: exts);
    return Results.Ok(response);
});
app.MapPost("/test-startApplication", async (StartAppDto body) =>
{
    var response = await ExecuteServices.StartApplication(body);
    return Results.Ok(response);
});

app.MapGet("/api/tasks/{taskId}/logs", (string taskId, int lines = 50) =>
{
    var response = ExecuteServices.PeekTask(taskId, lines);
    return Results.Ok(response);
});
app.MapPost("/api/tasks/{taskId}/stdin", async (string taskId, TaskInput body) =>
{
    try
    {
        await ExecuteServices.SendTaskInput(taskId, body.Input, body.IsRaw);
        return Results.Ok(new { success = true, taskId, message = "Input sent successfully." });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { success = false, message = ex.Message });
    }
});

app.MapPost("/kill/{pid:int}", (int pid) =>
{
    bool killed = ExecuteServices.KillTask(pid.ToString());
    if (ProcessLauncher.ActiveProcess.TryRemove(pid, out var proc))
    {
        try { proc.Kill(entireProcessTree: true); } catch { }
        proc.Dispose();
        killed = true;
    }
    if (killed)
    {
        return Results.Ok(new { success = true, message = $"Process {pid} terminated." });
    }
    return Results.NotFound(new { success = false, message = $"PID {pid} not found in active processes." });
});


app.MapGet("/system-info", () => Results.Content(SystemInfoService.GetSystemInfoJson(), "application/json"));
app.MapGet("/capture-screen", () =>
{
    var (success, base64, msg) = CaptureScreenShots.CaptureScreen();
    return Results.Ok(new { success, imageBase64 = base64, message = msg });
});

// Bind to 0.0.0.0 to accept LAN connections from other devices and browsers

app.Run("http://0.0.0.0:4100");