/** @param {any} request */
export function joinApprovalAllowed(request){return ['unreviewed','approval-needs-review','approved-awaiting-application','grant-unconfirmed'].includes(request?.state);}
