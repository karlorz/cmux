import { createCommand } from "lexical";

export const MENTION_MENU_VISIBILITY_COMMAND = createCommand<boolean>(
  "cmux/mention-menu-visibility"
);
