export type TextbookTopic = {
  unitNo: number;
  theme: string;
  titleIncludes: string[];
  aliases: string[];
};

export const TEXTBOOK_TOPICS: TextbookTopic[] = [
  {
    unitNo: 1,
    theme: '敬业',
    titleIncludes: ['第一单元', '学会敬业'],
    aliases: ['敬业', '职业道德', '工作态度', '责任心', '尽职尽责', '本职工作', '每天多做一点', '工匠精神'],
  },
  {
    unitNo: 2,
    theme: '诚信',
    titleIncludes: ['第二单元', '学会诚信'],
    aliases: ['诚信', '诚实', '守信', '承诺', '信守承诺', '诚信求职', '职业信用', '做人根本'],
  },
  {
    unitNo: 3,
    theme: '踏实',
    titleIncludes: ['第三单元', '学会踏实'],
    aliases: ['踏实', '脚踏实地', '浮躁', '跳槽', '从小事做起', '细节', '踏实稳重'],
  },
  {
    unitNo: 4,
    theme: '沟通',
    titleIncludes: ['第四单元', '学会沟通'],
    aliases: ['沟通', '表达', '倾听', '反馈', '说服', '批评技巧', '职场沟通', '与上沟通', '平等沟通'],
  },
  {
    unitNo: 5,
    theme: '协作',
    titleIncludes: ['第五单元', '学会协作'],
    aliases: ['协作', '团队', '团队合作', '团队协作', '配合', '同事相处', '凝聚力', '共同目标'],
  },
  {
    unitNo: 6,
    theme: '主动',
    titleIncludes: ['第六单元', '学会主动'],
    aliases: ['主动', '积极主动', '机会', '分外的事', '眼中有事', '主动交往', '获得先机'],
  },
  {
    unitNo: 7,
    theme: '坚持',
    titleIncludes: ['第七单元', '学会坚持'],
    aliases: ['坚持', '毅力', '不放弃', '不抛弃', '目标', '等待', '习惯', '坚持不懈'],
  },
  {
    unitNo: 8,
    theme: '学习',
    titleIncludes: ['第八单元', '学会学习'],
    aliases: ['学习', '学会学习', '终身学习', '自主学习', '学习方法', '科学学习', '会学'],
  },
  {
    unitNo: 9,
    theme: '自控',
    titleIncludes: ['第九单元', '学会自控'],
    aliases: ['自控', '自我控制', '情绪控制', '行为控制', '自我管理', '耐性', '职业人转化'],
  },
  {
    unitNo: 10,
    theme: '创新',
    titleIncludes: ['第十单元', '学会创新'],
    aliases: ['创新', '创新意识', '创新思维', '创造力', '逆向思维', '类比法', '科学思维', '创新能力'],
  },
];
