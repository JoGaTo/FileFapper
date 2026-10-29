'use strict';
const path=require('node:path');
// The display name may change; the existing account's profile location must not.
function profilePath({appData,override}){return override?path.resolve(override):path.join(appData,'D&F');}
module.exports={profilePath};
