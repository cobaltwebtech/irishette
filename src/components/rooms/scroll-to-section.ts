/** Sections of a room page that buttons scroll to (`data-<name>-section`). */
export type RoomSection = 'calendar' | 'gallery';

export function scrollToSection(section: RoomSection) {
	document
		.querySelector(`[data-${section}-section]`)
		?.scrollIntoView({ behavior: 'smooth' });
}
