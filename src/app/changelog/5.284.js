// @ts-nocheck
export default {version:'5.284', date:'2026-08-31', changes:[
  'EOM Missing Items + Recount Impact reports -- owner request: "add a copy button" and "group items ' +
  'by recommendation per location to limit repetitiveness." Both reports now group their rows by ' +
  'location first, then by the shared recommendation/result text within that location, instead of a ' +
  'flat table repeating the identical sentence once per row. New shared groupRowsByLocationThenKey() ' +
  '(src/views/eom-report-grouping.js) so the two reports can\'t grow two different groupings of the ' +
  'same idea. Both also get a "📋 Copy" button next to Print, exporting the same grouped structure as ' +
  'plain text -- what\'s copied can\'t disagree with what\'s on screen. Location selector was already ' +
  'working (owner-confirmed) and is unchanged.',
  'EOM Diagnosis -- owner copy edit (report going out to GMs and Supervisors): dropped the ' +
  '"-- verify, don\'t accuse" qualifier from the Second-Look Signals heading and reworded its ' +
  'sub-line to "A clean recount / verify makes these numbers airtight. and are worth a second look." ' +
  '(was "...Nothing here is an accusation -- just entries worth a second look together.").',
  'EOM Diagnosis -- owner request: outlined the "Once the EOM count is verified" decision-guide grid ' +
  '(table border was already implied by var(--bdr) cell borders but the outer table/th/td rule was ' +
  '0.5px and unbordered on the table element itself; now 1px throughout) and added <hr> dividers ' +
  'above and below it to separate it visually from the surrounding coaching text.'
]};
