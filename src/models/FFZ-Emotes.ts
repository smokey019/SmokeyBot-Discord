/**
 * FrankerFaceZ Emote Structure
 */
export interface FFZEmotes {
  css: null;
  height: number;
  hidden: boolean;
  id: number;
  margins: null;
  modifier: boolean;
  name: string;
  offset: null;
  owner: {
    _id: number;
    display_name: string;
    name: string;
  };
  public: boolean;
  urls: {
    '1'?: string;
    '2'?: string;
    '4'?: string;
  };
  width: number;
}

/**
 * FrankerFaceZ Emote Room Structure
 */
export interface FFZRoom {
  room?: {
    _id: number;
    css: null;
    display_name: string;
    id: string;
    is_group: boolean;
    moderator_badge: null;
    set: number;
    twitch_id: number;
  };
  sets?: unknown;
}

/**
 * Example
 *
const example = {
	room: {
		_id: 117715,
		css: null,
		display_name: 'Smokey',
		id: 'smokey',
		is_group: false,
		mod_urls: null,
		moderator_badge: null,
		set: 117727,
		twitch_id: 23735682,
		user_badges: {},
	},
	sets: {
		_id: {
			_type: 1,
			css: null,
			description: null,
			emoticons: [
				{
					css: null,
					height: 32,
					hidden: false,
					id: 491215,
					margins: null,
					modifier: false,
					name: 'KEKWOO',
					offset: null,
					owner: {
						_id: 536922,
						display_name: 'PepoHead',
						name: 'pepohead',
					},
					public: true,
					urls: {
						'1':
							'//cdn.frankerfacez.com/90/65/9065b80758c1ee0c39b9c67c91bc5c0d.PNG',
						'2':
							'//cdn.frankerfacez.com/fd/c9/fdc9280bad4d4e39e6555cf7c4e81899.PNG',
						'4':
							'//cdn.frankerfacez.com/78/83/7883cc84e12297b2e856753951089aee.png',
					},
					width: 32,
				},
			],
			icon: null,
			id: 117727,
			title: 'Channel: Smokey',
		},
	},
};
 */
