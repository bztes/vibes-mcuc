import * as v from 'valibot';

export const params = {
	uuid: v.pipe(v.string(), v.uuid())
};
