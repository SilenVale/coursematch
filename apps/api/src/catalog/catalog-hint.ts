/** 助理在教师给出课名后，说明与教务目录的关系。 */
export function catalogCourseHint(courseName: string, existsInCatalog: boolean): string {
  if (existsInCatalog) {
    return `教务目录里已有「${courseName}」，本活动会在此课种下为你新增一个教学班。`;
  }
  return `「${courseName}」尚未在教务目录中，确认创建后会登记为新课种。`;
}
