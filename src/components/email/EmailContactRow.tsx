import { Column, Link, Row, Text } from 'react-email';

/** Footer row with the property name and the contact address. */
export function EmailContactRow({ contactEmail }: { contactEmail: string }) {
	return (
		<Row className="my-[12px]">
			<Column className="text-center">
				<Text className="my-[8px] text-[12px] leading-[24px] text-stone-500">
					Irishette Bed & Breakfast
				</Text>
				<Text className="mt-[4px] mb-0 text-[12px] leading-[24px] font-semibold text-stone-500">
					<Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
				</Text>
			</Column>
		</Row>
	);
}
