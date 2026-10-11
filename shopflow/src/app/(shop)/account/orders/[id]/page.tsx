import { redirect } from "next/navigation";

export default function AccountOrderDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/orders/${params.id}`);
}
