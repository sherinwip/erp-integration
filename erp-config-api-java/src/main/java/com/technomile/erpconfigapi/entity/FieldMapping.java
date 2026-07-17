package com.technomile.erpconfigapi.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "field_mapping", uniqueConstraints = {
        @UniqueConstraint(name = "uq_field_mapping_step_array_target", columnNames = {"step_pk", "array_target_path", "target_path"})
})
public class FieldMapping {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "mapping_pk")
    private Long mappingPk;

    @Column(name = "step_pk", nullable = false)
    private Long stepPk;

    @Column(name = "source_path", nullable = false, length = 200)
    private String sourcePath;

    @Column(name = "target_path", nullable = false, length = 200)
    private String targetPath;

    @Column(name = "transform_type", nullable = false, length = 50)
    private String transformType;

    @Column(name = "transform_params", length = 500)
    private String transformParams;

    @Column(name = "default_value", length = 500)
    private String defaultValue;

    @Column(name = "is_required", nullable = false)
    private Boolean isRequired;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "array_source_path", nullable = false, length = 200)
    private String arraySourcePath;

    @Column(name = "array_target_path", nullable = false, length = 200)
    private String arrayTargetPath;

    @Column(name = "is_singleton_array", nullable = false)
    private Boolean isSingletonArray;

    @Column(name = "is_object_target", nullable = false)
    private Boolean isObjectTarget;

    public Long getMappingPk() { return mappingPk; }
    public void setMappingPk(Long mappingPk) { this.mappingPk = mappingPk; }
    public Long getStepPk() { return stepPk; }
    public void setStepPk(Long stepPk) { this.stepPk = stepPk; }
    public String getSourcePath() { return sourcePath; }
    public void setSourcePath(String sourcePath) { this.sourcePath = sourcePath; }
    public String getTargetPath() { return targetPath; }
    public void setTargetPath(String targetPath) { this.targetPath = targetPath; }
    public String getTransformType() { return transformType; }
    public void setTransformType(String transformType) { this.transformType = transformType; }
    public String getTransformParams() { return transformParams; }
    public void setTransformParams(String transformParams) { this.transformParams = transformParams; }
    public String getDefaultValue() { return defaultValue; }
    public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }
    public Boolean getIsRequired() { return isRequired; }
    public void setIsRequired(Boolean isRequired) { this.isRequired = isRequired; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public String getArraySourcePath() { return arraySourcePath; }
    public void setArraySourcePath(String arraySourcePath) { this.arraySourcePath = arraySourcePath; }
    public String getArrayTargetPath() { return arrayTargetPath; }
    public void setArrayTargetPath(String arrayTargetPath) { this.arrayTargetPath = arrayTargetPath; }
    public Boolean getIsSingletonArray() { return isSingletonArray; }
    public void setIsSingletonArray(Boolean isSingletonArray) { this.isSingletonArray = isSingletonArray; }
    public Boolean getIsObjectTarget() { return isObjectTarget; }
    public void setIsObjectTarget(Boolean isObjectTarget) { this.isObjectTarget = isObjectTarget; }
}
