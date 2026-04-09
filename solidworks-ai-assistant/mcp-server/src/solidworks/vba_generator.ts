/**
 * Generates SolidWorks macro VBA code as fallback when direct COM is not sufficient.
 * The generated code can be saved as .swp and run via SolidWorks macro runner.
 */

export interface VBAMacroParams {
  name: string;
  body: string;
}

export function generateBendTableMacro(bendTablePath: string): string {
  return `
' Macro CTM — Assign bend table to active Sheet Metal part
Dim swApp As Object
Dim swDoc As Object
Dim swFeat As Object

Sub main()
    Set swApp = Application.SldWorks
    Set swDoc = swApp.ActiveDoc
    If swDoc Is Nothing Then
        MsgBox "No active document."
        Exit Sub
    End If
    ' Apply gauge table
    Dim smFeat As Object
    Set smFeat = swDoc.GetActiveSheetMetalFolderBody
    smFeat.BendTablePath = "${bendTablePath}"
    swDoc.EditRebuild3
    MsgBox "Bend table assigned: ${bendTablePath}"
End Sub
`.trim();
}

export function generateExportDXFMacro(outputPath: string): string {
  return `
' Macro CTM — Export flat pattern to DXF
Dim swApp As Object
Dim swDoc As Object

Sub main()
    Set swApp = Application.SldWorks
    Set swDoc = swApp.ActiveDoc
    If swDoc Is Nothing Then
        MsgBox "No active document."
        Exit Sub
    End If
    Dim exportData As Object
    Set exportData = swApp.GetExportFileData(1) ' swExportDXF
    exportData.SetSheetMetalOptions 1, 1, 0, 0, 0, 0 ' flatten, include bend lines
    Dim bRet As Boolean
    bRet = swDoc.Extension.SaveAs("${outputPath}", 0, 0, exportData, 0, 0)
    If bRet Then
        MsgBox "DXF exported: ${outputPath}"
    Else
        MsgBox "DXF export failed."
    End If
End Sub
`.trim();
}

export function generateBOMExcelMacro(outputPath: string): string {
  return `
' Macro CTM — Export BOM to Excel
Dim swApp As Object
Dim swDraw As Object

Sub main()
    Set swApp = Application.SldWorks
    Set swDraw = swApp.ActiveDoc
    If swDraw Is Nothing Then
        MsgBox "No active drawing."
        Exit Sub
    End If
    Dim swBOM As Object
    Set swBOM = swDraw.GetFirstBOM
    If swBOM Is Nothing Then
        MsgBox "No BOM in this drawing."
        Exit Sub
    End If
    swBOM.SaveBOM "${outputPath}", 0 ' 0 = Excel
    MsgBox "BOM exported: ${outputPath}"
End Sub
`.trim();
}
