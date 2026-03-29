// jira-get-issues.js
// Uses the new /rest/api/3/search/jql endpoint (Jira Cloud)
 
async function getIssues() {
  const baseUrl = process.env.JIRA_BASE_URL || "";
  const email = process.env.JIRA_EMAIL || "";
  const apiToken = process.env.JIRA_API_TOKEN || "";
  const jql = process.env.JIRA_JQL || 'project = AP ORDER BY created DESC';
  const maxResults = Number(process.env.JIRA_MAX_RESULTS || 60);
 
  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      'Missing required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN'
    );
  }
 
  const auth = Buffer.from(email + ':' + apiToken).toString('base64');
 
  const params = new URLSearchParams({
    jql: jql,
    startAt: '0',
    maxResults: String(maxResults),
    fields: 'summary,status,assignee,priority'
  });
 
  const url = baseUrl.replace(/\/$/, '') + '/rest/api/3/search/jql?' + params;
 
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Accept': 'application/json'
    }
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Jira API error ' + response.status + ': ' + errorText);
  }
 
  const data = await response.json();
 
  console.log('Total found:', data.total);
  console.log('Returned:', data.issues.length);
  console.log('---');
 
  for (const issue of data.issues) {
    const key = issue.key || '';
    const summary = (issue.fields && issue.fields.summary) || '';
    const status =
      (issue.fields && issue.fields.status && issue.fields.status.name) || '';
    const assignee =
      (issue.fields &&
        issue.fields.assignee &&
        issue.fields.assignee.displayName) || 'Unassigned';
 
    console.log(key + ' | ' + status + ' | ' + assignee + ' | ' + summary);
  }
}
 
getIssues().catch(function (err) {
  console.error('Failed:', err.message);
  process.exit(1);
});