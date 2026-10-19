namespace Nexus.Agent.Models;

public class RunCommandDto
{
    public string Command { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 0;
    public bool IsDaemon { get; set; } = false;
    public string? TaskId { get; set; }
}
public class StartAppDto
{
    public string Application { get; set; } = "";
    public string? Arguments { get; set; } = "";
}
public class CommandResponse
{
    public string Cmd { get; set; } = "";
    public string Msg { get; set; } = "";
    public string TerminalOutput { get; set; } = "";
    public string TerminalError { get; set; } = "";
    public bool IsSuccess { get; set; }
    public string? Pid { get; set; }
    public string? VerifiedStatus { get; set; }
    public int? ExitCode { get; set; }
    public string? ImageBase64 { get; set; }
    public bool IsBackground { get; set; } = false;
    public string? TaskId { get; set; }
}

public class AppProcess(string name, int pid, string title)
{
    public string Name { get; } = name;
    public int Pid { get; } = pid;
    public string Title { get; } = title;
}

public class TaskInput
{
    public string Input { get; set; } = string.Empty;
    public bool IsRaw { get; set; } = false;
}
