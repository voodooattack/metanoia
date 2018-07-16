/** @hidden */
export function getInheritanceTree(entity: Function): Function[] {
  const tree: Function[] = [entity];
  const getPrototypeOf = (object: Function): void => {
    const proto = Object.getPrototypeOf(object);
    if (proto && proto.name) {
      tree.push(proto);
      getPrototypeOf(proto);
    }
  };
  getPrototypeOf(entity);
  return tree;
}