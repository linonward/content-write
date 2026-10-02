import { createCn } from "cn/config";

// 排版角色与阴影是自定义 token，需要告诉合并器它们属于哪一组，
// 否则 `text-body` 会被当作文字颜色，和 `text-ink` 互相覆盖。
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "title-page",
            "title-article",
            "title-section",
            "title-card",
            "body",
            "reading",
            "editor",
            "label",
            "meta",
            "mono",
            "display",
            "display-sm",
            "headline-lg",
            "headline",
            "headline-sm",
            "lead",
            "intro",
            "copy",
          ],
        },
      ],
      shadow: [{ shadow: ["float"] }],
    },
  },
});
