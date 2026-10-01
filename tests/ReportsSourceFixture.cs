// TEMP synthetic source for the two closed Reports operations only.
using System;using System.IO;using System.Collections;using System.Collections.Generic;using System.Web.Script.Serialization;
class ReportsSourceFixture {
 static int Main(string[] args){
  if(args.Length<3||args[0]!="--db")return 2;
  var json=new JavaScriptSerializer();json.MaxJsonLength=3000000;
  var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[1]));
  string operation=args[2];int limit=20,offset=0;string date=null;
  for(int i=3;i<args.Length;i+=2){if(i+1>=args.Length)return 2;switch(args[i]){case "--limit":case "--revision-limit":limit=int.Parse(args[i+1]);break;case "--offset":case "--revision-offset":offset=int.Parse(args[i+1]);break;case "--date":case "--report-date":date=args[i+1];break;default:return 2;}}
  if(limit<1||limit>100||offset<0)return 2;
  File.AppendAllText(args[1]+".calls",operation+":"+(date??"")+":"+limit+":"+offset+"\n");
  Dictionary<string,object> output;
  if(operation=="list-reports"){
   output=(Dictionary<string,object>)data["list"];var rows=new List<object>();
   foreach(Dictionary<string,object> row in (IEnumerable)output["reports"])if(date==null||(string)row["report_date"]==date)rows.Add(row);
   var page=rows.GetRange(Math.Min(offset,rows.Count),Math.Min(limit,Math.Max(0,rows.Count-offset)));bool more=offset+limit<rows.Count;
   output["reports"]=page;output["limit"]=limit;output["offset"]=offset;output["has_more"]=more;output["next_offset"]=more?(object)(offset+limit):null;
  }else if(operation=="get-report"){
   output=(Dictionary<string,object>)data["detail"];var report=(Dictionary<string,object>)output["report"];if((string)report["report_date"]!=date){Console.Error.Write("QA private source error");return 1;}
   var rows=new List<object>();foreach(object row in (IEnumerable)report["revisions"])rows.Add(row);bool more=offset+limit<rows.Count;
   report["revisions"]=rows.GetRange(Math.Min(offset,rows.Count),Math.Min(limit,Math.Max(0,rows.Count-offset)));
   report["revision_pagination"]=new Dictionary<string,object>{{"limit",limit},{"offset",offset},{"has_more",more},{"next_offset",more?(object)(offset+limit):null}};
  }else return 2;
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.Write(json.Serialize(output));return 0;
 }
}
