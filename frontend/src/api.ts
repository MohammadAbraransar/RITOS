const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
export type User = { id:string; email:string; full_name:string; role:string }
export type Ticket = {
 id:string; ticket_number:string; customer_id:string; transaction_id:string; order_id?:string|null;
 claimed_amount:number; currency:string; description:string; category:string; confidence:number; priority:string;
 queue:string; status:string; payment_verification:string; refund_status:string; duplicate_of_id?:string|null;
 assigned_to_id?:string|null; recommended_action:string; classification_evidence:Record<string,unknown>;
 created_at:string; updated_at:string; comments?:{id:string;author_id:string;body:string;internal:boolean;created_at:string}[]
}
let token = localStorage.getItem('ritos_token') || ''
export function setToken(value:string){ token=value; if(value) localStorage.setItem('ritos_token',value); else localStorage.removeItem('ritos_token') }
export function getToken(){ return token }
async function request<T>(path:string, options:RequestInit={}):Promise<T>{
 const headers:Record<string,string>={'Content-Type':'application/json',...(options.headers as Record<string,string>||{})}
 if(token) headers.Authorization=`Bearer ${token}`
 const response=await fetch(`${API}${path}`,{...options,headers})
 if(!response.ok){ let message=`Request failed (${response.status})`; try{const data=await response.json();message=typeof data.detail==='string'?data.detail:message}catch{}; throw new Error(message) }
 return response.status===204?undefined as T:response.json()
}
export const api={
 login:(email:string,password:string)=>request<{access_token:string;user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})}),
 me:()=>request<User>('/auth/me'),
 tickets:(params='')=>request<{items:Ticket[];total:number}>('/tickets'+params),
 ticket:(id:string)=>request<Ticket>(`/tickets/${id}`),
 createTicket:(data:unknown)=>request<Ticket>('/tickets',{method:'POST',body:JSON.stringify(data)}),
 updateTicket:(id:string,data:unknown)=>request<Ticket>(`/tickets/${id}`,{method:'PATCH',body:JSON.stringify(data)}),
 comment:(id:string,body:string,internal=false)=>request(`/tickets/${id}/comments`,{method:'POST',body:JSON.stringify({body,internal})}),
 escalate:(id:string)=>request<Ticket>(`/tickets/${id}/escalate`,{method:'POST'}),
 analytics:()=>request<any>('/analytics/overview'),
 refunds:()=>request<any[]>('/refunds'),
 createRefund:(ticket_id:string,amount:number,reason:string)=>request<any>('/refunds',{method:'POST',body:JSON.stringify({ticket_id,amount,reason})}),
 approveRefund:(id:string,reason:string)=>request<any>(`/refunds/${id}/approve`,{method:'POST',body:JSON.stringify({reason})}),
 rejectRefund:(id:string,reason:string)=>request<any>(`/refunds/${id}/reject`,{method:'POST',body:JSON.stringify({reason})}),
 executeRefund:(id:string)=>request<any>(`/refunds/${id}/execute`,{method:'POST'}),
 audit:()=>request<any[]>('/admin/audit-logs'),
 users:()=>request<User[]>('/admin/users')
}
