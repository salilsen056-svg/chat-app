export function visibleProfile(user, allowed) {
 return {id:user.id,name:user.name,email:allowed?user.email:null,
  avatarUrl:allowed&&user.photoVersion?`/api/avatars/${user.id}?v=${user.photoVersion}`:null,
  profileVisible:allowed};
}
