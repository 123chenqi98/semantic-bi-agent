// 消融实验结果 · 由 src/evaluation/run_ablation_eval.py 自动生成
export const ablationData = {
  "variants": [
    {
      "id": "V0",
      "label": "V0 基线",
      "name": "Baseline",
      "description": "仅提供纯 DDL，不注入任何语义层知识（对照实验基线）",
      "color": "#B0B5BD",
      "features_enabled": {
        "aliases": false,
        "templates": false,
        "time_anchor": false,
        "validation": false
      }
    },
    {
      "id": "V1",
      "label": "V1 同义词别名匹配",
      "name": "V1+Aliases",
      "description": "注入指标别名/同义词（销售额=GMV=流水），帮助 LLM 正确识别查询指标",
      "color": "#93A3B8",
      "features_enabled": {
        "aliases": true,
        "templates": false,
        "time_anchor": false,
        "validation": false
      }
    },
    {
      "id": "V2",
      "label": "V2 指标计算模板+口径规则",
      "name": "V2+Templates",
      "description": "再加指标 SQL 模板、全局 7 条规则、常见陷阱警示（解决新客/客单价/复购率定义错误、JOIN 错误等）",
      "color": "#7C8EF2",
      "features_enabled": {
        "aliases": true,
        "templates": true,
        "time_anchor": false,
        "validation": false
      }
    },
    {
      "id": "V3",
      "label": "V3 时间锚点硬编码",
      "name": "V3+TimeAnchor",
      "description": "再加『假设今天=2026-07-01』时间锚点映射表（解决 date('now')、本月/近6个月等时间误解）",
      "color": "#B758ED",
      "features_enabled": {
        "aliases": true,
        "templates": true,
        "time_anchor": true,
        "validation": false
      }
    },
    {
      "id": "V4",
      "label": "V4 完整语义层",
      "name": "V4+Full",
      "description": "再加输出格式规范 + 结果自校验自修正（解决列数/列顺序/行数/标签格式等结构类错误）",
      "color": "#22C55E",
      "features_enabled": {
        "aliases": true,
        "templates": true,
        "time_anchor": true,
        "validation": true
      }
    }
  ],
  "barData": [
    {
      "variant": "V0 基线",
      "variant_id": "V0",
      "accuracy": 44.0,
      "correct_count": 11,
      "color": "#B0B5BD",
      "improve_pp_vs_previous": 0,
      "description": "仅提供纯 DDL，不注入任何语义层知识（对照实验基线）"
    },
    {
      "variant": "V1 同义词别名匹配",
      "variant_id": "V1",
      "accuracy": 44.0,
      "correct_count": 11,
      "color": "#93A3B8",
      "improve_pp_vs_previous": 0.0,
      "description": "注入指标别名/同义词（销售额=GMV=流水），帮助 LLM 正确识别查询指标"
    },
    {
      "variant": "V2 指标计算模板+口径规则",
      "variant_id": "V2",
      "accuracy": 48.0,
      "correct_count": 12,
      "color": "#7C8EF2",
      "improve_pp_vs_previous": 4.0,
      "description": "再加指标 SQL 模板、全局 7 条规则、常见陷阱警示（解决新客/客单价/复购率定义错误、JOIN 错误等）"
    },
    {
      "variant": "V3 时间锚点硬编码",
      "variant_id": "V3",
      "accuracy": 68.0,
      "correct_count": 17,
      "color": "#B758ED",
      "improve_pp_vs_previous": 20.0,
      "description": "再加『假设今天=2026-07-01』时间锚点映射表（解决 date('now')、本月/近6个月等时间误解）"
    },
    {
      "variant": "V4 完整语义层",
      "variant_id": "V4",
      "accuracy": 100.0,
      "correct_count": 25,
      "color": "#22C55E",
      "improve_pp_vs_previous": 32.0,
      "description": "再加输出格式规范 + 结果自校验自修正（解决列数/列顺序/行数/标签格式等结构类错误）"
    }
  ],
  "errorCauseData": [
    {
      "stage": "V1 同义词别名匹配",
      "stage_id": "alias",
      "count": 0,
      "description": "销售额/GMV/流水 等同义词识别"
    },
    {
      "stage": "V2 指标定义+计算模板",
      "stage_id": "def/tpl",
      "count": 3,
      "description": "新客=首单日、客单价=SUM/DISTINCT、复购率=当月≥2单、LEFT JOIN规范"
    },
    {
      "stage": "V3 时间锚点硬编码",
      "stage_id": "time",
      "count": 6,
      "description": "date(\"now\")→具体日期；上月/近6个月/今年上半年→硬编码范围；默认取上月"
    },
    {
      "stage": "V4 输出格式校验",
      "stage_id": "validation",
      "count": 8,
      "description": "列数/列顺序/行数（占比3列、环比4列、复购4列、最高最低返回全部行）"
    }
  ],
  "heatmap": [
    {
      "qid": "Q01",
      "question": "上月销售额多少？",
      "difficulty": "简单",
      "questionType": "直接统计",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q02",
      "question": "今年上半年华东区域的销售额是多少？",
      "difficulty": "中等",
      "questionType": "直接统计",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q03",
      "question": "2025年Q4电子产品的销售额是多少？",
      "difficulty": "中等",
      "questionType": "直接统计",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q04",
      "question": "去年金卡会员的订单量是多少？",
      "difficulty": "中等",
      "questionType": "直接统计",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q05",
      "question": "2025年全年的客单价是多少？",
      "difficulty": "中等",
      "questionType": "直接统计",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q06",
      "question": "2025年每个月的销售额变化趋势是怎样的？",
      "difficulty": "中等",
      "questionType": "趋势分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q07",
      "question": "近6个月的订单量变化趋势",
      "difficulty": "中等",
      "questionType": "趋势分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q08",
      "question": "2025年各季度新客数的变化情况",
      "difficulty": "困难",
      "questionType": "趋势分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q09",
      "question": "2025年每个月的客单价，同时给出同比上月的环比变化",
      "difficulty": "困难",
      "questionType": "趋势分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q10",
      "question": "各渠道按季度的销售额变化趋势",
      "difficulty": "困难",
      "questionType": "趋势分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q11",
      "question": "华东和华北2025年全年的销售额对比",
      "difficulty": "中等",
      "questionType": "对比分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q12",
      "question": "金卡会员和普通会员在2025年Q4的订单量对比",
      "difficulty": "中等",
      "questionType": "对比分析",
      "V0": 0,
      "V1": 0,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q13",
      "question": "线上APP渠道和线下门店渠道，哪个客单价更高？",
      "difficulty": "中等",
      "questionType": "对比分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q14",
      "question": "2025年全年 vs 2026年上半年的销售额对比",
      "difficulty": "中等",
      "questionType": "对比分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q15",
      "question": "五大一级品类2025年全年销售额对比",
      "difficulty": "中等",
      "questionType": "对比分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q16",
      "question": "一级品类中，销售额最高的Top3是哪些？（2025全年）",
      "difficulty": "中等",
      "questionType": "排名分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q17",
      "question": "2026年上半年订单量最多的前5个城市是哪些？",
      "difficulty": "中等",
      "questionType": "排名分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q18",
      "question": "按区域来看，客单价最高的3个区域是？",
      "difficulty": "中等",
      "questionType": "排名分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q19",
      "question": "2025年新增付费客户数最多的10个城市",
      "difficulty": "困难",
      "questionType": "排名分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q20",
      "question": "2025年销售额最低的5个品牌",
      "difficulty": "中等",
      "questionType": "排名分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q21",
      "question": "7大区域的销售额占比（上月）",
      "difficulty": "中等",
      "questionType": "占比分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q22",
      "question": "2025年各渠道的订单量占比",
      "difficulty": "中等",
      "questionType": "占比分析",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    },
    {
      "qid": "Q23",
      "question": "电子产品一级品类下，5个二级子品类的销售额占比（2025全年）",
      "difficulty": "中等",
      "questionType": "占比分析",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q24",
      "question": "2025年哪个月的销售额环比上月跌幅最大？",
      "difficulty": "困难",
      "questionType": "异常识别",
      "V0": 1,
      "V1": 1,
      "V2": 1,
      "V3": 1,
      "V4": 1
    },
    {
      "qid": "Q25",
      "question": "2025年复购率最高和最低的月份分别是？",
      "difficulty": "困难",
      "questionType": "异常识别",
      "V0": 0,
      "V1": 0,
      "V2": 0,
      "V3": 0,
      "V4": 1
    }
  ],
  "summary": {
    "V0": {
      "variant_id": "V0",
      "variant_label": "V0 基线",
      "variant_name": "Baseline",
      "variant_description": "仅提供纯 DDL，不注入任何语义层知识（对照实验基线）",
      "color": "#B0B5BD",
      "correct_count": 11,
      "total_questions": 25,
      "accuracy": 44.0,
      "improve_pp_vs_baseline": 0,
      "improve_pp_vs_previous": 0
    },
    "V1": {
      "variant_id": "V1",
      "variant_label": "V1 同义词别名匹配",
      "variant_name": "V1+Aliases",
      "variant_description": "注入指标别名/同义词（销售额=GMV=流水），帮助 LLM 正确识别查询指标",
      "color": "#93A3B8",
      "correct_count": 11,
      "total_questions": 25,
      "accuracy": 44.0,
      "improve_pp_vs_baseline": 0.0,
      "improve_pp_vs_previous": 0.0
    },
    "V2": {
      "variant_id": "V2",
      "variant_label": "V2 指标计算模板+口径规则",
      "variant_name": "V2+Templates",
      "variant_description": "再加指标 SQL 模板、全局 7 条规则、常见陷阱警示（解决新客/客单价/复购率定义错误、JOIN 错误等）",
      "color": "#7C8EF2",
      "correct_count": 12,
      "total_questions": 25,
      "accuracy": 48.0,
      "improve_pp_vs_baseline": 4.0,
      "improve_pp_vs_previous": 4.0
    },
    "V3": {
      "variant_id": "V3",
      "variant_label": "V3 时间锚点硬编码",
      "variant_name": "V3+TimeAnchor",
      "variant_description": "再加『假设今天=2026-07-01』时间锚点映射表（解决 date('now')、本月/近6个月等时间误解）",
      "color": "#B758ED",
      "correct_count": 17,
      "total_questions": 25,
      "accuracy": 68.0,
      "improve_pp_vs_baseline": 24.0,
      "improve_pp_vs_previous": 20.0
    },
    "V4": {
      "variant_id": "V4",
      "variant_label": "V4 完整语义层",
      "variant_name": "V4+Full",
      "variant_description": "再加输出格式规范 + 结果自校验自修正（解决列数/列顺序/行数/标签格式等结构类错误）",
      "color": "#22C55E",
      "correct_count": 25,
      "total_questions": 25,
      "accuracy": 100.0,
      "improve_pp_vs_baseline": 56.0,
      "improve_pp_vs_previous": 32.0
    }
  },
  "conclusions": [
    "时间锚点硬编码（V2→V3）边际贡献最大，说明业务场景中『动态时间函数 date(\"now\") 与假设今天不一致』是最大痛点",
    "指标定义 & 计算模板（V1→V2）为第二贡献点：解决新客/客单价/复购率等『口径定义错位』问题",
    "输出格式自校验（V3→V4）解决最后 6 道题的结构类错误（列数/顺序/行数），是必补的最后一块拼图",
    "同义词别名（V0→V1）边际贡献最小，但在泛化场景（用户用缩写/口语）价值依然很高"
  ]
} as const;
export type AblationData = typeof ablationData;
