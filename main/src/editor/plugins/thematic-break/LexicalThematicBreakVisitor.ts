/* eslint-disable @typescript-eslint/no-deprecated -- The legacy React horizontal-rule path remains the compatibility implementation; extension migration is tracked separately. */
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode.js'
import * as Mdast from 'mdast'
import { LexicalExportVisitor } from '../../exportMarkdownFromLexical'

export const LexicalThematicBreakVisitor: LexicalExportVisitor<HorizontalRuleNode, Mdast.ThematicBreak> = {
  testLexicalNode: (node): node is HorizontalRuleNode => node instanceof HorizontalRuleNode,
  visitLexicalNode({ actions }) {
    actions.addAndStepInto('thematicBreak')
  }
}
