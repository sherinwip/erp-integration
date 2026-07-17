package com.technomile.erpconfigapi.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "step", uniqueConstraints = {
        @UniqueConstraint(name = "uq_step_client_name", columnNames = {"client_id", "step_name"})
})
public class Step {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "step_pk")
    private Long stepPk;

    @Column(name = "client_id", nullable = false, length = 50)
    private String clientId;

    @Column(name = "target_id", nullable = false, length = 150)
    private String targetId;

    @Column(name = "step_name", nullable = false, length = 100)
    private String stepName;

    @Column(name = "method", nullable = false, length = 10)
    private String method;

    @Column(name = "path", nullable = false, length = 500)
    private String path;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "query_params", columnDefinition = "jsonb")
    private Map<String, Object> queryParams;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "headers", columnDefinition = "jsonb")
    private Map<String, Object> headers;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extract", columnDefinition = "jsonb")
    private Map<String, Object> extract;

    @Column(name = "on_not_found", nullable = false, length = 20)
    private String onNotFound;

    @Column(name = "on_multiple_results", nullable = false, length = 20)
    private String onMultipleResults;

    @Column(name = "rollback_method", length = 10)
    private String rollbackMethod;

    @Column(name = "rollback_path", length = 500)
    private String rollbackPath;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "updated_at", nullable = false)
    @UpdateTimestamp
    private OffsetDateTime updatedAt;

    public Long getStepPk() { return stepPk; }
    public void setStepPk(Long stepPk) { this.stepPk = stepPk; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getStepName() { return stepName; }
    public void setStepName(String stepName) { this.stepName = stepName; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public Map<String, Object> getQueryParams() { return queryParams; }
    public void setQueryParams(Map<String, Object> queryParams) { this.queryParams = queryParams; }
    public Map<String, Object> getHeaders() { return headers; }
    public void setHeaders(Map<String, Object> headers) { this.headers = headers; }
    public Map<String, Object> getExtract() { return extract; }
    public void setExtract(Map<String, Object> extract) { this.extract = extract; }
    public String getOnNotFound() { return onNotFound; }
    public void setOnNotFound(String onNotFound) { this.onNotFound = onNotFound; }
    public String getOnMultipleResults() { return onMultipleResults; }
    public void setOnMultipleResults(String onMultipleResults) { this.onMultipleResults = onMultipleResults; }
    public String getRollbackMethod() { return rollbackMethod; }
    public void setRollbackMethod(String rollbackMethod) { this.rollbackMethod = rollbackMethod; }
    public String getRollbackPath() { return rollbackPath; }
    public void setRollbackPath(String rollbackPath) { this.rollbackPath = rollbackPath; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
