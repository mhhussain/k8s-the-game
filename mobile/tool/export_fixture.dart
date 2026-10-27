import 'dart:convert';
import 'dart:io';
import 'package:k8sthegame/engine/game.dart';
void main(){
 final g=Game(seed:42);g.dispatch('BUILD_IMAGE',{'repoId':'repo-1'});for(var i=0;i<5;i++){g.buildTick();}g.dispatch('FORM_NEW');g.dispatch('SERVICE_SAVE');for(var i=0;i<3;i++){g.advance();}g.dispatch('TICKET_RESOLVE',{'id':'TCK-101'});
 final raw=jsonDecode(g.exportSave('Mobile compatibility fixture'));raw['savedAt']=0;
 File('test/fixtures/mobile-save.json').writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(raw)}\n');
}
