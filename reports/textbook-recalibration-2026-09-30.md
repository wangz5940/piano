# 小汤1、小汤2、拜厄重新校准记录

生成时间：2026-09-30T13:42:45.318Z；流程：textbook-recalibration/v2。

本轮更新 166 个教材片段，共 25190 个音符。
其中 42 个片段仍有 152 条节拍或连线错误；所有输出保留 needs_review，L0–L3 未标记为人工确认。无 error 也不代表已逐音校对。

## 已完成的修正

- 按小节号和重复次数对齐声部，左右手按局部谱表与明确手别识别；忽略隐藏的占位休止。
- 恢复 85 个 part/measure 中可唯一推导的零 divisions 时间刻度，保留原 XML 版式、连线与其他记谱信息。
- 恢复原谱拍号，保留中途换拍和换调；不扩大拍数或截断时值来隐藏识谱错误。
- 简谱保留左右手休止、逐小节调性和拍号；跟弹按同时起音分组，并在 source_events 中保留各声部时值。
- 仅从人工样本中提取一致的固定五指手位，按整句音域与已有指号唯一匹配，生成 3513 个待复核指号。已有和弦标签仅在小节、时值和双手音高完全匹配时保留。
- beyer.segment.009：PDF 15（书页13）变奏1：单用左手；首行8小节，首三小节依次为G4 G4、B4 B4、A4 A4，均为二分音符。OMR把首三小节合并为G G F并误作三连音，后续二分/全音符 duration 也按错误比例放大。
- beyer.segment.142：PDF 91（书页89）附录第4条，C拍号，每小节四组三个八分音符，按三连音记时。
- beyer.segment.153：PDF 94（书页92）附录第17条，C拍号，前三小节及第二行前三小节每小节四组三个八分音符；句末两个三连音组加二分音符。
- beyer.segment.155：PDF 94（书页92）附录第19条，C拍号，每小节四组三个八分音符；末小节全音符不缩短。
- beyer.segment.160：PDF 96（书页94）附录第25条，C拍号，双手八分音符每拍三音；句末保留二分音符。
- beyer.segment.163：PDF 97（书页95）附录第28条，2/4拍，每小节两组三个八分音符。第6小节左手E4 C4 A3 D4 B3 G3均为八分三连音，OMR把后三音拆为三个声部的四分音符。
- john-thompson-easiest-2.segment.011：PDF 31（书页29）《大家一起捉迷藏》3/4拍；当前片段前12小节属于该曲，原XML漏了起始拍号。第13小节在下一页开始4/4谱例，保留其显式拍号。

## 保留范围

人工校准原样保留：beyer.segment.032、beyer.segment.047、beyer.segment.048、beyer.segment.049、beyer.segment.053、beyer.segment.054、beyer.segment.055、beyer.segment.056、beyer.segment.057。

保留软删除状态的片段：24 个；无可用音高简谱而跳过：john-thompson-easiest-1.segment.009。
原始 PDF/OMR/MusicXML、哈农、人工校准及已删除片段的资源和数据库行均不由本流程写入。数据库与备份不提交 Git。

## 仍需复核的范围

自由节奏的认音谱例暂按旧模型表示，可能触发超拍提示；原 OMR 的漏音、误休止、错分声部和装饰音仍须结合原页处理。完整 issues（含小节和事件 ID）见同名 JSON 报告与逐段校准快照。

| 片段 | PDF页 | 小节 | 音符 | error | 其他提示 |
| --- | --- | ---: | ---: | ---: | ---: |
| beyer.segment.003 | 14 | 16 | 106 | 0 | 2 |
| beyer.segment.004 | 14 | 16 | 106 | 0 | 2 |
| beyer.segment.005 | 14 | 16 | 140 | 0 | 2 |
| beyer.segment.006 | 14 | 16 | 146 | 0 | 3 |
| beyer.segment.007 | 14 | 16 | 85 | 0 | 2 |
| beyer.segment.008 | 15 | 16 | 16 | 0 | 2 |
| beyer.segment.009 | 15 | 16 | 28 | 0 | 2 |
| beyer.segment.010 | 15 | 16 | 31 | 0 | 2 |
| beyer.segment.011 | 15 | 15 | 38 | 0 | 3 |
| beyer.segment.012 | 15 | 16 | 27 | 0 | 2 |
| beyer.segment.017 | 17 | 16 | 39 | 0 | 2 |
| beyer.segment.018 | 17 | 16 | 28 | 0 | 2 |
| beyer.segment.019 | 17 | 16 | 41 | 0 | 3 |
| beyer.segment.023 | 19 | 46 | 163 | 0 | 7 |
| beyer.segment.026 | 21 | 16 | 81 | 0 | 1 |
| beyer.segment.027 | 21 | 32 | 128 | 0 | 1 |
| beyer.segment.030 | 23 | 16 | 86 | 0 | 1 |
| beyer.segment.031 | 23、24 | 40 | 166 | 0 | 1 |
| beyer.segment.033 | 24 | 16 | 84 | 0 | 0 |
| beyer.segment.034 | 25 | 16 | 53 | 0 | 0 |
| beyer.segment.035 | 25 | 24 | 121 | 0 | 0 |
| beyer.segment.036 | 25 | 16 | 78 | 0 | 3 |
| beyer.segment.037 | 26 | 16 | 84 | 0 | 0 |
| beyer.segment.038 | 26 | 16 | 94 | 0 | 0 |
| beyer.segment.039 | 26 | 16 | 93 | 0 | 0 |
| beyer.segment.040 | 26、27 | 16 | 101 | 0 | 0 |
| beyer.segment.041 | 27 | 16 | 84 | 0 | 0 |
| beyer.segment.042 | 27 | 12 | 79 | 0 | 0 |
| beyer.segment.043 | 27 | 16 | 83 | 0 | 0 |
| beyer.segment.044 | 28 | 16 | 87 | 0 | 0 |
| beyer.segment.045 | 28 | 16 | 94 | 0 | 0 |
| beyer.segment.046 | 28 | 16 | 95 | 0 | 0 |
| beyer.segment.058 | 32 | 24 | 102 | 0 | 12 |
| beyer.segment.059 | 33 | 12 | 81 | 0 | 1 |
| beyer.segment.060 | 33 | 16 | 95 | 0 | 1 |
| beyer.segment.061 | 33 | 16 | 122 | 0 | 1 |
| beyer.segment.065 | 35 | 20 | 148 | 0 | 2 |
| beyer.segment.066 | 35 | 16 | 80 | 0 | 2 |
| beyer.segment.067 | 35 | 16 | 97 | 0 | 3 |
| beyer.segment.069 | 37、38 | 45 | 276 | 2 | 22 |
| beyer.segment.070 | 38 | 16 | 188 | 1 | 3 |
| beyer.segment.071 | 38 | 17 | 173 | 2 | 3 |
| beyer.segment.072 | 39 | 12 | 99 | 0 | 1 |
| beyer.segment.073 | 39 | 17 | 92 | 0 | 1 |
| beyer.segment.074 | 40 | 17 | 99 | 0 | 5 |
| beyer.segment.075 | 40、41 | 36 | 283 | 1 | 8 |
| beyer.segment.076 | 41 | 13 | 133 | 0 | 1 |
| beyer.segment.077 | 42 | 17 | 151 | 0 | 1 |
| beyer.segment.078 | 42 | 16 | 74 | 0 | 1 |
| beyer.segment.079 | 43 | 20 | 220 | 9 | 18 |
| beyer.segment.080 | 43 | 16 | 128 | 0 | 1 |
| beyer.segment.081 | 44 | 16 | 101 | 0 | 10 |
| beyer.segment.082 | 44 | 13 | 98 | 0 | 6 |
| beyer.segment.083 | 44、45 | 32 | 155 | 0 | 1 |
| beyer.segment.084 | 45 | 24 | 153 | 0 | 3 |
| beyer.segment.085 | 46 | 16 | 117 | 0 | 1 |
| beyer.segment.086 | 46、47 | 32 | 219 | 1 | 2 |
| beyer.segment.089 | 49 | 18 | 60 | 0 | 6 |
| beyer.segment.090 | 49、50 | 27 | 138 | 0 | 10 |
| beyer.segment.091 | 50 | 27 | 231 | 0 | 2 |
| beyer.segment.092 | 51 | 16 | 167 | 0 | 2 |
| beyer.segment.093 | 51 | 14 | 92 | 1 | 9 |
| beyer.segment.094 | 52 | 20 | 175 | 0 | 3 |
| beyer.segment.095 | 52、53 | 26 | 159 | 0 | 8 |
| beyer.segment.096 | 53 | 26 | 213 | 4 | 2 |
| beyer.segment.097 | 53、54 | 16 | 106 | 0 | 1 |
| beyer.segment.098 | 54 | 16 | 172 | 0 | 2 |
| beyer.segment.099 | 54 | 17 | 155 | 3 | 27 |
| beyer.segment.100 | 55、56 | 39 | 471 | 20 | 65 |
| beyer.segment.101 | 56 | 16 | 115 | 0 | 5 |
| beyer.segment.102 | 57 | 16 | 176 | 0 | 1 |
| beyer.segment.103 | 57 | 24 | 185 | 1 | 3 |
| beyer.segment.104 | 58、59 | 42 | 450 | 2 | 9 |
| beyer.segment.105 | 59 | 17 | 144 | 0 | 12 |
| beyer.segment.106 | 60 | 25 | 218 | 1 | 6 |
| beyer.segment.107 | 61、62 | 56 | 492 | 0 | 7 |
| beyer.segment.108 | 63 | 34 | 245 | 0 | 16 |
| beyer.segment.109 | 64 | 20 | 208 | 0 | 3 |
| beyer.segment.110 | 65 | 17 | 196 | 0 | 4 |
| beyer.segment.111 | 65 | 13 | 108 | 0 | 6 |
| beyer.segment.113 | 67 | 22 | 279 | 4 | 4 |
| beyer.segment.115 | 69 | 16 | 294 | 2 | 4 |
| beyer.segment.116 | 70 | 17 | 238 | 0 | 14 |
| beyer.segment.117 | 71 | 25 | 309 | 0 | 6 |
| beyer.segment.118 | 72、73 | 42 | 411 | 1 | 29 |
| beyer.segment.119 | 74 | 24 | 223 | 1 | 4 |
| beyer.segment.120 | 75 | 25 | 200 | 0 | 6 |
| beyer.segment.121 | 76、77 | 32 | 319 | 0 | 8 |
| beyer.segment.122 | 77 | 16 | 179 | 0 | 1 |
| beyer.segment.123 | 78 | 17 | 113 | 0 | 6 |
| beyer.segment.124 | 78、79 | 40 | 388 | 0 | 2 |
| beyer.segment.125 | 79 | 24 | 228 | 0 | 6 |
| beyer.segment.126 | 80 | 34 | 239 | 0 | 10 |
| beyer.segment.127 | 80 | 13 | 133 | 0 | 8 |
| beyer.segment.128 | 81 | 48 | 345 | 10 | 12 |
| beyer.segment.129 | 82、83 | 24 | 417 | 1 | 2 |
| beyer.segment.130 | 83 | 20 | 294 | 0 | 43 |
| beyer.segment.131 | 84 | 14 | 132 | 0 | 10 |
| beyer.segment.132 | 84 | 16 | 169 | 0 | 5 |
| beyer.segment.133 | 85 | 25 | 310 | 8 | 29 |
| beyer.segment.134 | 86 | 19 | 173 | 0 | 13 |
| beyer.segment.135 | 86、87 | 45 | 309 | 2 | 24 |
| beyer.segment.136 | 87 | 5 | 50 | 0 | 2 |
| beyer.segment.137 | 87、88 | 9 | 87 | 0 | 2 |
| beyer.segment.138 | 88 | 5 | 98 | 0 | 4 |
| beyer.segment.139 | 88、89 | 16 | 217 | 1 | 15 |
| beyer.segment.140 | 89、90、91 | 56 | 556 | 0 | 13 |
| beyer.segment.141 | 91 | 8 | 63 | 0 | 2 |
| beyer.segment.142 | 91 | 8 | 68 | 0 | 10 |
| beyer.segment.143 | 91 | 8 | 61 | 0 | 2 |
| beyer.segment.144 | 92 | 16 | 114 | 0 | 2 |
| beyer.segment.145 | 92 | 16 | 80 | 0 | 2 |
| beyer.segment.146 | 92 | 17 | 128 | 0 | 3 |
| beyer.segment.147 | 92、93 | 9 | 68 | 4 | 2 |
| beyer.segment.148 | 93 | 8 | 63 | 1 | 2 |
| beyer.segment.149 | 93 | 4 | 36 | 4 | 2 |
| beyer.segment.150 | 93 | 4 | 32 | 0 | 2 |
| beyer.segment.151 | 93 | 8 | 64 | 0 | 2 |
| beyer.segment.152 | 93 | 8 | 61 | 0 | 2 |
| beyer.segment.153 | 94 | 8 | 68 | 0 | 8 |
| beyer.segment.154 | 94 | 16 | 80 | 0 | 2 |
| beyer.segment.155 | 94 | 5 | 37 | 0 | 6 |
| beyer.segment.156 | 94、95 | 20 | 166 | 7 | 5 |
| beyer.segment.157 | 95 | 8 | 128 | 0 | 2 |
| beyer.segment.158 | 95 | 4 | 64 | 0 | 2 |
| beyer.segment.159 | 95 | 8 | 122 | 0 | 2 |
| beyer.segment.160 | 96 | 8 | 136 | 0 | 14 |
| beyer.segment.161 | 96 | 16 | 160 | 0 | 2 |
| beyer.segment.162 | 96、97 | 16 | 288 | 0 | 9 |
| beyer.segment.163 | 97 | 8 | 96 | 0 | 2 |
| beyer.segment.164 | 97 | 4 | 114 | 0 | 2 |
| beyer.segment.165 | 98 | 4 | 128 | 0 | 2 |
| beyer.segment.166 | 98 | 8 | 257 | 0 | 3 |
| beyer.segment.167 | 99 | 16 | 172 | 2 | 2 |
| beyer.segment.168 | 99 | 16 | 192 | 0 | 2 |
| beyer.segment.169 | 99、100、101 | 88 | 976 | 4 | 8 |
| beyer.segment.170 | 102 | 17 | 70 | 0 | 12 |
| john-thompson-easiest-1.segment.001 | 11、12、13、14、15、16 | 29 | 45 | 0 | 3 |
| john-thompson-easiest-1.segment.002 | 17、18、19、20、21、22、23、24 | 59 | 118 | 3 | 3 |
| john-thompson-easiest-1.segment.003 | 24 | 4 | 7 | 0 | 3 |
| john-thompson-easiest-1.segment.004 | 24 | 4 | 6 | 0 | 6 |
| john-thompson-easiest-1.segment.005 | 25、26 | 22 | 40 | 1 | 2 |
| john-thompson-easiest-1.segment.006 | 27 | 1 | 7 | 1 | 2 |
| john-thompson-easiest-1.segment.007 | 27、28 | 16 | 32 | 0 | 12 |
| john-thompson-easiest-1.segment.008 | 28 | 12 | 25 | 0 | 28 |
| john-thompson-easiest-1.segment.010 | 31、32 | 17 | 36 | 3 | 4 |
| john-thompson-easiest-1.segment.011 | 32、33、34、35、37 | 54 | 130 | 0 | 4 |
| john-thompson-easiest-1.segment.012 | 37、38 | 16 | 31 | 0 | 2 |
| john-thompson-easiest-1.segment.013 | 38、39、40 | 32 | 70 | 0 | 27 |
| john-thompson-easiest-1.segment.014 | 40、41、42、43 | 60 | 167 | 1 | 9 |
| john-thompson-easiest-2.segment.001 | 6、7、8、9、10、11、12、13、14、15、16、17、18 | 165 | 640 | 7 | 35 |
| john-thompson-easiest-2.segment.002 | 20 | 8 | 30 | 0 | 11 |
| john-thompson-easiest-2.segment.003 | 22、23 | 36 | 124 | 0 | 19 |
| john-thompson-easiest-2.segment.004 | 23、24 | 22 | 41 | 1 | 4 |
| john-thompson-easiest-2.segment.005 | 24 | 16 | 97 | 6 | 3 |
| john-thompson-easiest-2.segment.006 | 25、26 | 29 | 132 | 1 | 6 |
| john-thompson-easiest-2.segment.007 | 27、28、29、30 | 40 | 117 | 19 | 5 |
| john-thompson-easiest-2.segment.008 | 30、31 | 24 | 108 | 0 | 14 |
| john-thompson-easiest-2.segment.009 | 31 | 8 | 30 | 0 | 10 |
| john-thompson-easiest-2.segment.010 | 31 | 2 | 4 | 0 | 2 |
| john-thompson-easiest-2.segment.011 | 31、32 | 18 | 56 | 1 | 13 |
| john-thompson-easiest-2.segment.012 | 32 | 10 | 37 | 3 | 4 |
| john-thompson-easiest-2.segment.013 | 33 | 8 | 110 | 0 | 2 |
| john-thompson-easiest-2.segment.014 | 34 | 16 | 63 | 0 | 3 |
| john-thompson-easiest-2.segment.015 | 35、36、37、38、39、40、41、42 | 153 | 700 | 1 | 33 |
| john-thompson-easiest-2.segment.016 | 42、43、44、45、46、47、48、49 | 195 | 540 | 4 | 22 |

## 复现与验证

需要本地 data/panio.sqlite、原始 .trae/documents/*_MusicXML，以及现有教材资源。

```sh
npm run calibrate:textbooks
npm run verify:textbooks -- --output=.generated/textbook-recalibration
npm run calibrate:textbooks:write
npm run verify:textbooks
npm test
npm run check
npx tsc -p scripts/tsconfig.json
npm run lint
npm run build
```

默认只生成暂存结果。--write 自动备份数据库和待覆盖文件，在事务中再次检查人工记录、删除状态和输入文件；检测到并发修改时停止覆盖。失败时回滚数据库和已写文件。
public/materials/calibration/<教材>/<序号>.json 保存校准工程及校验结果；生产使用的简谱、MusicXML、跟弹资源一同提交。校准数据库行写入本机 SQLite，其他实例的数据库不会被 Git 自动更新。
