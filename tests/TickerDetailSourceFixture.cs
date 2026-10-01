// Isolated JAR smoke fake source. Not part of the product or a formal database.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
class TickerDetailSourceFixture {
    static int Main(string[] args) {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        try { return Read(args); }
        catch (Exception error) { Console.Error.Write(error.GetType().FullName + ": " + error.Message); return 4; }
    }
    static int Read(string[] args) {
        if (args.Length != 11 || args[0] != "--db" || args[2] != "list-signals" || args[3] != "--source"
            || (args[4] != "reports" && args[4] != "sec") || args[5] != "--limit" || args[7] != "--offset" || args[9] != "--ticker") return 2;
        var json = new JavaScriptSerializer(); json.MaxJsonLength = 2 * 1024 * 1024;
        var root = json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[1]));
        var mode = (string)root[args[4] + "Mode"];
        File.AppendAllText(args[1] + ".calls", args[4] + ":" + args[10] + ":" + args[6] + ":" + args[8] + "\n");
        if (mode == "ERROR") { Console.Write("{bad JSON private source path"); return 0; }
        if (mode == "UNAVAILABLE") { Console.Error.Write("private stderr must not escape"); return 3; }
        var data = (Dictionary<string,object>)root[args[4]];
        var limit = int.Parse(args[6]); var offset = int.Parse(args[8]);
        var all = ((System.Collections.IEnumerable)data["signals"]).Cast<Dictionary<string,object>>().Where(r => string.Equals((string)r["ticker"],args[10],StringComparison.OrdinalIgnoreCase)).ToArray();
        var rows = mode == "EMPTY" ? new Dictionary<string,object>[0] : all.Skip(offset).Take(limit).ToArray();
        var more = mode != "EMPTY" && all.Length > offset + limit;
        data["signals"] = rows;data["limit"] = limit;data["offset"] = offset;data["has_more"] = more;data["next_offset"] = more ? (object)(offset + limit) : null;
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);Console.Write(json.Serialize(data));return 0;
    }
}
