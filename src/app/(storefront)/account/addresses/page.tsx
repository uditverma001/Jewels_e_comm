import type { Metadata } from 'next';
import { getAuthContext } from '@/server/auth/session';
import { listAddresses } from '@/server/addresses/service';
import { buildMetadata } from '@/lib/seo';
import { AddressBook } from '@/components/account/address-book';

export const metadata: Metadata = buildMetadata({
  title: 'Your addresses',
  description: 'Manage your saved delivery addresses.',
  path: '/account/addresses',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const { user } = await getAuthContext();
  if (!user) return null;

  const addresses = await listAddresses(user.id);

  return (
    <div>
      <h2 className="mb-6 text-[1.375rem]">Saved addresses</h2>
      <AddressBook
        addresses={addresses.map((address) => ({
          id: address.id,
          label: address.label,
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2 ?? '',
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          isDefault: address.isDefault,
        }))}
      />
    </div>
  );
}
