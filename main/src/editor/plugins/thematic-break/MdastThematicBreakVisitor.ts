/* eslint-disable @typescript-eslint/no-deprecated -- The legacy React horizontal-rule path remains the compatibility implementation; extension migration is tracked separately. */
import { $createHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode.js'
import * as Mdast from 'mdast'
import { MdastImportVisitor } from '../../importMarkdownToLexical'

export const MdastThematicBreakVisitor: MdastImportVisitor<Mdast.ThematicBreak> = {
  testNode: 'thematicBreak',
  visitNode({ actions }) {
    actions.addAndStepInto($createHorizontalRuleNode())
  }
}
