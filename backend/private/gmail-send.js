const clean=(v,max=12000)=>String(v??'').trim().slice(0,max);

function base64Url(text){
  return Buffer.from(text,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function sendAuthorizedGmail({accessToken,recipient,subject,body}){
  const token=clean(accessToken,6000),to=clean(recipient,320),subj=clean(subject,500),messageBody=clean(body,12000);
  if(!token)throw new Error('Gmail connection is required');
  if(!to||!subj||!messageBody)throw new Error('Authorized email is incomplete');
  const message=[`To: ${to}`,`Subject: ${subj}`,'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"','',messageBody].join('\r\n');
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({raw:base64Url(message)})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`Gmail send failed (${response.status})`);
  return {providerMessageId:data.id||'',threadId:data.threadId||''};
}
